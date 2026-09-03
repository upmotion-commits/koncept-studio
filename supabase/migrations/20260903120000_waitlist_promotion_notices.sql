-- ============================================================================
-- Waitlist promotion notices — reliable, class-aware promotion notifications
-- ============================================================================
-- Run AFTER 20260830100000_phase3_core.sql. Additive and safe on a live app:
-- it adds one table plus one helper function and replaces cancel_booking_v2
-- with the same logic plus one INSERT. The currently deployed application
-- keeps working unchanged — it simply ignores the new return field.
--
-- WHY
--   Promotion notifications were fired from the member's browser after the
--   cancel RPC returned, using the *cancelling* member's session to read the
--   *promoted* member's profile. Three consequences, all observed:
--     1. a closed tab / lost connection lost the notification permanently —
--        the promoted member kept the class and was never told;
--     2. if profiles.SELECT is self-only under RLS, the read returned nothing
--        and the send was skipped silently (production has 7 promotion
--        messages in 11 months, all in admin-clicked bursts);
--     3. the message named no class, so a member on several waitlists could
--        not tell what they had been given.
--
--   Promotion is now recorded in the same transaction that grants the place.
--   A service-role worker drains the queue and sends the message with the
--   class name, date and time. Nothing can be lost: the notice is committed
--   with the booking or not at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The outbox
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlist_promotion_notices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id)         ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES public.class_schedules(id)  ON DELETE CASCADE,
  booking_id   uuid          REFERENCES public.class_bookings(id)   ON DELETE SET NULL,
  promoted_by  uuid          REFERENCES public.profiles(id)         ON DELETE SET NULL,
  promoted_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,          -- a worker is sending this one
  notified_at  timestamptz,          -- delivered (or deliberately skipped)
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  -- One live notice per member per class. A genuinely new promotion into the
  -- same class resets the row, so it is announced again; a retry of the same
  -- promotion cannot produce a second message.
  UNIQUE (user_id, schedule_id)
);

-- The worker's only query: undelivered notices, oldest first.
CREATE INDEX IF NOT EXISTS waitlist_promotion_notices_pending_idx
  ON public.waitlist_promotion_notices (promoted_at)
  WHERE notified_at IS NULL;

ALTER TABLE public.waitlist_promotion_notices ENABLE ROW LEVEL SECURITY;

-- Admins can read the queue (it is the audit trail for "was the member told?").
-- There is deliberately no INSERT/UPDATE/DELETE policy: rows are written only
-- by the SECURITY DEFINER functions below and by the service-role worker.
DROP POLICY IF EXISTS "Admins can view waitlist promotion notices"
  ON public.waitlist_promotion_notices;
CREATE POLICY "Admins can view waitlist promotion notices"
  ON public.waitlist_promotion_notices FOR SELECT
  USING (public.check_user_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. Admin-initiated promotions enqueue through here
--    (the two admin server actions promote by writing class_bookings directly;
--    they cannot write the outbox themselves, and must not be able to send a
--    WhatsApp to an arbitrary user id, so authorization lives in the database.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_waitlist_promotion_notice(
  p_user_id     uuid,
  p_schedule_id uuid,
  p_booking_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT public.check_user_admin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_admin',
      'message', 'Action réservée aux administrateurs');
  END IF;

  -- The member must actually hold a confirmed place in that class, otherwise
  -- this is just a message-sending primitive.
  IF NOT EXISTS (
    SELECT 1 FROM public.class_bookings
     WHERE user_id = p_user_id AND schedule_id = p_schedule_id AND status = 'confirmed'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_confirmed_booking',
      'message', 'Aucune réservation confirmée pour ce membre sur ce cours');
  END IF;

  INSERT INTO public.waitlist_promotion_notices
    (user_id, schedule_id, booking_id, promoted_by)
  VALUES (p_user_id, p_schedule_id, p_booking_id, v_caller)
  ON CONFLICT (user_id, schedule_id) DO UPDATE
    SET booking_id  = EXCLUDED.booking_id,
        promoted_at = now(),
        promoted_by = EXCLUDED.promoted_by,
        claimed_at  = NULL,
        notified_at = NULL,
        attempts    = 0,
        last_error  = NULL
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'notice_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_waitlist_promotion_notice(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_waitlist_promotion_notice(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. cancel_booking_v2 — unchanged, except the promotion now also enqueues a
--    notice inside the same transaction (see the marked block).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_booking RECORD;
  v_capacity integer;
  v_count integer;
  v_head RECORD;
  v_promoted_user uuid := NULL;
  v_existing_row uuid;
  v_promoted_booking uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated',
      'message', 'Utilisateur non authentifié');
  END IF;

  SELECT cb.id, cb.user_id, cb.schedule_id, cb.subscription_id, cb.booked_at,
         cs.start_datetime, cs.class_id
  INTO v_booking
  FROM public.class_bookings cb
  JOIN public.class_schedules cs ON cs.id = cb.schedule_id
  WHERE cb.id = p_booking_id
    AND cb.user_id = v_user
    AND cb.status = 'confirmed'
  FOR UPDATE OF cb;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Réservation non trouvée ou déjà annulée');
  END IF;

  IF v_booking.start_datetime <= now() + interval '3 hours' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'too_late',
      'message', 'Vous ne pouvez pas annuler cette réservation car elle commence dans moins de trois heures.');
  END IF;

  UPDATE public.class_bookings
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = p_booking_id;

  PERFORM public.apply_credit_movement(
    v_booking.subscription_id, 1, 'cancellation_refund',
    p_booking_id, v_booking.schedule_id, v_user, v_booking.booked_at);

  -- Inline waitlist promotion (the old trigger never worked; see audit).
  -- The promoted user already paid their credit when joining the waitlist.
  SELECT c.max_capacity INTO v_capacity FROM public.classes c WHERE c.id = v_booking.class_id;
  SELECT COUNT(*) INTO v_count
  FROM public.class_bookings
  WHERE schedule_id = v_booking.schedule_id AND status = 'confirmed';

  IF v_count < v_capacity AND v_booking.start_datetime > now() THEN
    SELECT cw.id, cw.user_id, cw.subscription_id, cw.position
    INTO v_head
    FROM public.class_waitlist cw
    WHERE cw.schedule_id = v_booking.schedule_id
    ORDER BY cw.position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_head.id IS NOT NULL THEN
      SELECT id INTO v_existing_row
      FROM public.class_bookings
      WHERE user_id = v_head.user_id AND schedule_id = v_booking.schedule_id;

      IF v_existing_row IS NOT NULL THEN
        UPDATE public.class_bookings
        SET status = 'confirmed', subscription_id = v_head.subscription_id,
            cancelled_at = NULL, cancellation_reason = NULL,
            booked_at = now(), updated_at = now()
        WHERE id = v_existing_row
        RETURNING id INTO v_promoted_booking;
      ELSE
        INSERT INTO public.class_bookings (user_id, schedule_id, subscription_id, status)
        VALUES (v_head.user_id, v_booking.schedule_id, v_head.subscription_id, 'confirmed')
        RETURNING id INTO v_promoted_booking;
      END IF;

      DELETE FROM public.class_waitlist WHERE id = v_head.id;
      -- (adjust_waitlist_positions trigger renumbers the rest)

      INSERT INTO public.credit_ledger
        (user_id, subscription_id, booking_id, schedule_id, field, delta, reason, created_by)
      VALUES
        (v_head.user_id, v_head.subscription_id, NULL, v_booking.schedule_id,
         'none', 0, 'waitlist_promotion_credit_paid_at_join', v_user);

      -- NEW: the promotion notice is committed with the place itself, so it
      -- survives the cancelling member closing their tab. A worker sends it.
      INSERT INTO public.waitlist_promotion_notices
        (user_id, schedule_id, booking_id, promoted_by)
      VALUES (v_head.user_id, v_booking.schedule_id, v_promoted_booking, v_user)
      ON CONFLICT (user_id, schedule_id) DO UPDATE
        SET booking_id  = EXCLUDED.booking_id,
            promoted_at = now(),
            promoted_by = EXCLUDED.promoted_by,
            claimed_at  = NULL,
            notified_at = NULL,
            attempts    = 0,
            last_error  = NULL;

      v_promoted_user := v_head.user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Réservation annulée avec succès',
    'promoted_user_id', v_promoted_user,
    'promotion_notice_pending', v_promoted_user IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_v2(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Verification (read-only)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ASSERT (SELECT to_regclass('public.waitlist_promotion_notices') IS NOT NULL),
    'waitlist_promotion_notices was not created';
  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.waitlist_promotion_notices'::regclass),
    'RLS is not enabled on waitlist_promotion_notices';
  ASSERT NOT has_function_privilege('anon',
    'public.enqueue_waitlist_promotion_notice(uuid,uuid,uuid)', 'EXECUTE'),
    'anon can still execute enqueue_waitlist_promotion_notice';
  RAISE NOTICE '✅ waitlist promotion notices installed';
END $$;
