-- ============================================================================
-- PHASE 3 — CORE MIGRATION (run BEFORE deploying the new application code)
-- Safe to run while the current app is live: it only ADDS objects, fixes the
-- broken promotion trigger, hardens read functions, and corrects 5 counter
-- rows + 2 settings values. It does not remove anything the live app calls.
--
-- Run in Supabase SQL Editor as a single script.
-- Rollback: supabase/migrations/20260830100000_phase3_core.rollback.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CREDIT LEDGER — append-only audit of every credit movement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.class_bookings(id) ON DELETE SET NULL,
  schedule_id uuid,
  field text NOT NULL CHECK (field IN ('credits_remaining', 'weekly_credits_used', 'none')),
  delta integer NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_subscription_id ON public.credit_ledger (subscription_id, created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own credit ledger" ON public.credit_ledger;
CREATE POLICY "Users can view own credit ledger"
  ON public.credit_ledger FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all credit ledger" ON public.credit_ledger;
CREATE POLICY "Admins can view all credit ledger"
  ON public.credit_ledger FOR SELECT
  USING (public.check_user_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE policies: writes only happen inside SECURITY DEFINER
-- functions or with the service role.

-- ----------------------------------------------------------------------------
-- 2. NO-SHOW PENALTIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.no_show_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL UNIQUE REFERENCES public.class_bookings(id) ON DELETE CASCADE,
  flagged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_show_penalties_user_active
  ON public.no_show_penalties (user_id, expires_at DESC);

ALTER TABLE public.no_show_penalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own penalties" ON public.no_show_penalties;
CREATE POLICY "Users can view own penalties"
  ON public.no_show_penalties FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all penalties" ON public.no_show_penalties;
CREATE POLICY "Admins can view all penalties"
  ON public.no_show_penalties FOR SELECT
  USING (public.check_user_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATION LOG — idempotency guard for scheduled notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, type)
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view notification log" ON public.notification_log;
CREATE POLICY "Admins can view notification log"
  ON public.notification_log FOR SELECT
  USING (public.check_user_admin(auth.uid()));
-- Writes happen only with the service role (cron), which bypasses RLS.

-- ----------------------------------------------------------------------------
-- 4. Allow the new WhatsApp event type
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_event_type_check;
ALTER TABLE public.whatsapp_logs ADD CONSTRAINT whatsapp_logs_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'signup'::text, 'activation'::text, 'waitlist_promotion'::text,
    'class_cancellation'::text, 'subscription_request'::text,
    'subscription_expiring'::text
  ]));

-- ----------------------------------------------------------------------------
-- 5. Booking-window helpers (windows open Sunday 17:00 and Wednesday 17:00,
--    Africa/Casablanca — mirrors the app's isEventBookingOpen logic)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.last_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  casa timestamp; -- local wall-clock time in Casablanca
  dow int;        -- 0=Sun .. 6=Sat
  candidate timestamp;
  best timestamp := NULL;
  d int;
BEGIN
  casa := p_at AT TIME ZONE 'Africa/Casablanca';
  -- walk back up to 7 days looking for the latest Sun/Wed 17:00 <= casa
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', casa) - make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate <= casa AND dow IN (0, 3) THEN
      best := candidate;
      EXIT;
    END IF;
  END LOOP;
  RETURN best AT TIME ZONE 'Africa/Casablanca';
END;
$$;

CREATE OR REPLACE FUNCTION public.next_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  casa timestamp;
  dow int;
  candidate timestamp;
  d int;
BEGIN
  casa := p_at AT TIME ZONE 'Africa/Casablanca';
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', casa) + make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate > casa AND dow IN (0, 3) THEN
      RETURN candidate AT TIME ZONE 'Africa/Casablanca';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.last_window_opening(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_window_opening(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_window_opening(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_window_opening(timestamptz) TO authenticated, service_role;

-- Active penalty for a user (NULL when none)
CREATE OR REPLACE FUNCTION public.active_penalty_until(p_user uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT max(expires_at)
  FROM public.no_show_penalties
  WHERE user_id = p_user
    AND now() >= starts_at
    AND now() < expires_at;
$$;

REVOKE ALL ON FUNCTION public.active_penalty_until(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_penalty_until(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Internal, type-aware credit movement (single source of truth + ledger)
--    direction: -1 = consume, +1 = refund
--    p_reference_time: when the original deduction happened; a weekly refund
--    is skipped (delta 0) if the deduction predates the last weekly reset.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_credit_movement(
  p_subscription_id uuid,
  p_direction integer,
  p_reason text,
  p_booking_id uuid DEFAULT NULL,
  p_schedule_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_reference_time timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
  v_field text;
  v_delta integer := 0;
  v_reason text := p_reason;
BEGIN
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'INVALID_DIRECTION';
  END IF;

  SELECT us.*, sp.type AS plan_type, sp.weekly_limit
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.id = p_subscription_id
  FOR UPDATE OF us;

  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF v_sub.plan_type = 'abonnement' THEN
    v_field := 'weekly_credits_used';
    IF p_direction = -1 THEN
      IF v_sub.weekly_limit IS NOT NULL AND v_sub.weekly_credits_used >= v_sub.weekly_limit THEN
        RAISE EXCEPTION 'WEEKLY_LIMIT_REACHED';
      END IF;
      UPDATE public.user_subscriptions
      SET weekly_credits_used = weekly_credits_used + 1, updated_at = now()
      WHERE id = p_subscription_id;
      v_delta := 1; -- +1 on weekly_credits_used
    ELSE
      -- refund only if the deduction belongs to the current weekly period
      IF v_sub.last_weekly_reset IS NOT NULL AND p_reference_time < v_sub.last_weekly_reset THEN
        v_delta := 0;
        v_reason := p_reason || '_skipped_weekly_reset';
      ELSE
        UPDATE public.user_subscriptions
        SET weekly_credits_used = GREATEST(0, weekly_credits_used - 1), updated_at = now()
        WHERE id = p_subscription_id;
        v_delta := -1;
      END IF;
    END IF;
  ELSIF v_sub.plan_type = 'carnet' THEN
    v_field := 'credits_remaining';
    IF p_direction = -1 THEN
      IF v_sub.credits_remaining <= 0 THEN
        RAISE EXCEPTION 'NO_CREDITS';
      END IF;
      UPDATE public.user_subscriptions
      SET credits_remaining = credits_remaining - 1,
          credits_used = COALESCE(credits_used, 0) + 1,
          updated_at = now()
      WHERE id = p_subscription_id;
      v_delta := -1;
    ELSE
      UPDATE public.user_subscriptions
      SET credits_remaining = credits_remaining + 1,
          credits_used = GREATEST(0, COALESCE(credits_used, 0) - 1),
          updated_at = now()
      WHERE id = p_subscription_id;
      v_delta := 1;
    END IF;
  ELSE
    -- personal_training: no credit bookkeeping
    v_field := 'none';
    v_delta := 0;
    v_reason := p_reason || '_no_credit_plan';
  END IF;

  INSERT INTO public.credit_ledger
    (user_id, subscription_id, booking_id, schedule_id, field, delta, reason, created_by)
  VALUES
    (v_sub.user_id, p_subscription_id, p_booking_id, p_schedule_id, v_field, v_delta, v_reason, p_actor);

  RETURN jsonb_build_object('success', true, 'field', v_field, 'delta', v_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_movement(uuid, integer, text, uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_movement(uuid, integer, text, uuid, uuid, uuid, timestamptz) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. Subscription selection helper (abonnement first, then carnet)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_booking_subscription(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT us.id
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user
    AND us.status = 'active'
    AND us.end_date >= now()
    AND (
      (sp.type = 'abonnement' AND (sp.weekly_limit IS NULL OR us.weekly_credits_used < sp.weekly_limit))
      OR (sp.type = 'carnet' AND us.credits_remaining > 0)
    )
  ORDER BY CASE sp.type WHEN 'abonnement' THEN 1 ELSE 2 END, us.end_date DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pick_booking_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_booking_subscription(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. book_class_v2 — atomic, capacity-safe, penalty-aware booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_class_v2(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_schedule RECORD;
  v_capacity integer;
  v_count integer;
  v_sub_id uuid;
  v_sub RECORD;
  v_existing RECORD;
  v_booking_id uuid;
  v_penalty timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated',
      'message', 'Utilisateur non authentifié');
  END IF;

  v_penalty := public.active_penalty_until(v_user);
  IF v_penalty IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_show_penalty',
      'blocked_until', v_penalty,
      'message', 'Réservation bloquée suite à une absence non signalée. Vous pourrez réserver à nouveau le '
        || to_char(v_penalty AT TIME ZONE 'Africa/Casablanca', 'DD/MM/YYYY à HH24:MI') || '.');
  END IF;

  -- Lock the schedule row: serializes all booking attempts on this class
  SELECT cs.id, cs.start_datetime, cs.is_cancelled, cs.class_id
  INTO v_schedule
  FROM public.class_schedules cs
  WHERE cs.id = p_schedule_id
  FOR UPDATE;

  IF v_schedule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Créneau non trouvé');
  END IF;
  IF v_schedule.is_cancelled THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cancelled', 'message', 'Ce cours a été annulé');
  END IF;
  IF v_schedule.start_datetime <= now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_started', 'message', 'Le cours a déjà commencé');
  END IF;

  SELECT c.max_capacity INTO v_capacity FROM public.classes c WHERE c.id = v_schedule.class_id;
  SELECT COUNT(*) INTO v_count
  FROM public.class_bookings
  WHERE schedule_id = p_schedule_id AND status = 'confirmed';

  -- Existing booking for this user?
  SELECT id, status INTO v_existing
  FROM public.class_bookings
  WHERE user_id = v_user AND schedule_id = p_schedule_id;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_booked',
      'message', 'Vous avez déjà réservé ce cours');
  END IF;

  IF v_count >= v_capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_full',
      'message', 'Le cours est complet');
  END IF;

  v_sub_id := public.pick_booking_subscription(v_user);
  IF v_sub_id IS NULL THEN
    -- distinguish the error message like the current app does
    IF EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = v_user AND us.status = 'active' AND us.end_date >= now()
        AND sp.type = 'abonnement'
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'weekly_limit',
        'message', 'Limite hebdomadaire de séances atteinte');
    ELSIF EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = v_user AND us.status = 'active' AND us.end_date >= now()
        AND sp.type = 'carnet'
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'no_credits',
        'message', 'Plus de crédits disponibles');
    ELSIF EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = v_user AND us.status = 'active' AND sp.type = 'personal_training'
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'personal_training_only',
        'message', 'Vous ne pouvez pas réserver un cours avec votre abonnement actuel. Merci d''ajouter un abonnement ou un carnet pour effectuer une réservation.');
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'no_subscription',
        'message', 'Aucun abonnement actif trouvé');
    END IF;
  END IF;

  -- Create or re-confirm the booking
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.class_bookings
    SET status = 'confirmed', subscription_id = v_sub_id,
        cancelled_at = NULL, cancellation_reason = NULL, updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_booking_id;
  ELSE
    INSERT INTO public.class_bookings (user_id, schedule_id, subscription_id, status)
    VALUES (v_user, p_schedule_id, v_sub_id, 'confirmed')
    RETURNING id INTO v_booking_id;
  END IF;

  -- Consume the credit (raises on WEEKLY_LIMIT_REACHED / NO_CREDITS,
  -- which aborts the whole transaction including the booking)
  PERFORM public.apply_credit_movement(v_sub_id, -1, 'booking', v_booking_id, p_schedule_id, v_user);

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id,
    'subscription_id', v_sub_id, 'message', 'Réservation confirmée');
END;
$$;

REVOKE ALL ON FUNCTION public.book_class_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_class_v2(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. cancel_booking_v2 — atomic cancel + refund + inline waitlist promotion
--    Deadline: 3 hours before class start (the rule the app enforces today).
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
        WHERE id = v_existing_row;
      ELSE
        INSERT INTO public.class_bookings (user_id, schedule_id, subscription_id, status)
        VALUES (v_head.user_id, v_booking.schedule_id, v_head.subscription_id, 'confirmed');
      END IF;

      DELETE FROM public.class_waitlist WHERE id = v_head.id;
      -- (adjust_waitlist_positions trigger renumbers the rest)

      INSERT INTO public.credit_ledger
        (user_id, subscription_id, booking_id, schedule_id, field, delta, reason, created_by)
      VALUES
        (v_head.user_id, v_head.subscription_id, NULL, v_booking.schedule_id,
         'none', 0, 'waitlist_promotion_credit_paid_at_join', v_user);

      v_promoted_user := v_head.user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Réservation annulée avec succès',
    'promoted_user_id', v_promoted_user);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_v2(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. join_waitlist_v2 — atomic join, fullness decided by REAL booking count
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_waitlist_v2(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_schedule RECORD;
  v_capacity integer;
  v_count integer;
  v_sub_id uuid;
  v_entry RECORD;
  v_penalty timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated',
      'message', 'Utilisateur non authentifié');
  END IF;

  v_penalty := public.active_penalty_until(v_user);
  IF v_penalty IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_show_penalty',
      'blocked_until', v_penalty,
      'message', 'Réservation bloquée suite à une absence non signalée. Vous pourrez réserver à nouveau le '
        || to_char(v_penalty AT TIME ZONE 'Africa/Casablanca', 'DD/MM/YYYY à HH24:MI') || '.');
  END IF;

  SELECT cs.id, cs.start_datetime, cs.is_cancelled, cs.class_id
  INTO v_schedule
  FROM public.class_schedules cs
  WHERE cs.id = p_schedule_id
  FOR UPDATE;

  IF v_schedule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Cours non trouvé');
  END IF;
  IF v_schedule.is_cancelled OR v_schedule.start_datetime <= now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_unavailable',
      'message', 'Ce cours n''est plus disponible');
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_waitlist WHERE user_id = v_user AND schedule_id = p_schedule_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_on_waitlist',
      'message', 'Vous êtes déjà sur la liste d''attente');
  END IF;
  IF EXISTS (SELECT 1 FROM public.class_bookings
             WHERE user_id = v_user AND schedule_id = p_schedule_id AND status = 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_booked',
      'message', 'Vous avez déjà réservé ce cours');
  END IF;

  -- REAL count, not the cached counter (fixes the "cannot join waitlist" trap)
  SELECT c.max_capacity INTO v_capacity FROM public.classes c WHERE c.id = v_schedule.class_id;
  SELECT COUNT(*) INTO v_count
  FROM public.class_bookings
  WHERE schedule_id = p_schedule_id AND status = 'confirmed';

  IF v_count < v_capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_not_full',
      'message', 'Le cours n''est pas complet, vous pouvez le réserver directement');
  END IF;

  v_sub_id := public.pick_booking_subscription(v_user);
  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits',
      'message', 'Aucun crédit disponible pour rejoindre la liste d''attente');
  END IF;

  INSERT INTO public.class_waitlist (user_id, schedule_id, subscription_id, position)
  VALUES (v_user, p_schedule_id, v_sub_id, 1) -- position overwritten by trigger
  RETURNING id, position INTO v_entry;

  PERFORM public.apply_credit_movement(v_sub_id, -1, 'waitlist_join', NULL, p_schedule_id, v_user);

  RETURN jsonb_build_object('success', true, 'waitlist_id', v_entry.id,
    'position', v_entry.position, 'message', 'Ajouté à la liste d''attente');
END;
$$;

REVOKE ALL ON FUNCTION public.join_waitlist_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist_v2(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. leave_waitlist_v2 — atomic leave + refund (fixes silent credit loss)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_waitlist_v2(p_waitlist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_entry RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated',
      'message', 'Utilisateur non authentifié');
  END IF;

  SELECT id, user_id, schedule_id, subscription_id, joined_at
  INTO v_entry
  FROM public.class_waitlist
  WHERE id = p_waitlist_id AND user_id = v_user
  FOR UPDATE;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Entrée de liste d''attente non trouvée');
  END IF;

  DELETE FROM public.class_waitlist WHERE id = v_entry.id;
  -- (adjust_waitlist_positions trigger renumbers the rest)

  PERFORM public.apply_credit_movement(
    v_entry.subscription_id, 1, 'waitlist_leave_refund',
    NULL, v_entry.schedule_id, v_user, v_entry.joined_at);

  RETURN jsonb_build_object('success', true, 'message', 'Retiré de la liste d''attente');
END;
$$;

REVOKE ALL ON FUNCTION public.leave_waitlist_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_waitlist_v2(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. admin_book_class_v2 — admin booking, same invariants
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_book_class_v2(p_user_id uuid, p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_schedule RECORD;
  v_capacity integer;
  v_count integer;
  v_sub_id uuid;
  v_existing RECORD;
  v_booking_id uuid;
BEGIN
  IF NOT public.check_user_admin(v_admin) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized', 'message', 'Non autorisé');
  END IF;

  SELECT cs.id, cs.start_datetime, cs.is_cancelled, cs.class_id
  INTO v_schedule
  FROM public.class_schedules cs WHERE cs.id = p_schedule_id
  FOR UPDATE;

  IF v_schedule IS NULL OR v_schedule.is_cancelled THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Créneau non trouvé');
  END IF;

  SELECT c.max_capacity INTO v_capacity FROM public.classes c WHERE c.id = v_schedule.class_id;
  SELECT COUNT(*) INTO v_count
  FROM public.class_bookings WHERE schedule_id = p_schedule_id AND status = 'confirmed';

  SELECT id, status INTO v_existing
  FROM public.class_bookings
  WHERE user_id = p_user_id AND schedule_id = p_schedule_id;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_booked',
      'message', 'L''utilisateur a déjà une réservation confirmée pour ce cours');
  END IF;

  IF v_count >= v_capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_full', 'message', 'Le cours est complet');
  END IF;

  v_sub_id := public.pick_booking_subscription(p_user_id);
  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits',
      'message', 'Aucun crédit disponible pour cet utilisateur');
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.class_bookings
    SET status = 'confirmed', subscription_id = v_sub_id,
        cancelled_at = NULL, cancellation_reason = NULL,
        booked_at = now(), updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_booking_id;
  ELSE
    INSERT INTO public.class_bookings (user_id, schedule_id, subscription_id, status)
    VALUES (p_user_id, p_schedule_id, v_sub_id, 'confirmed')
    RETURNING id INTO v_booking_id;
  END IF;

  PERFORM public.apply_credit_movement(v_sub_id, -1, 'admin_booking', v_booking_id, p_schedule_id, v_admin);

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_book_class_v2(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_book_class_v2(uuid, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. admin_refund_schedule_bookings — used when the studio cancels/deletes a
--     class: cancels every confirmed booking on a FUTURE schedule and refunds
--     the right field per plan type (fixes the abonnement wrong-field refund
--     and the historical-bookings refund bug).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_refund_schedule_bookings(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_schedule RECORD;
  v_b RECORD;
  v_refunded integer := 0;
BEGIN
  IF NOT public.check_user_admin(v_admin) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized', 'message', 'Non autorisé');
  END IF;

  SELECT id, start_datetime INTO v_schedule
  FROM public.class_schedules WHERE id = p_schedule_id
  FOR UPDATE;

  IF v_schedule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Créneau non trouvé');
  END IF;

  IF v_schedule.start_datetime <= now() THEN
    -- Past classes: nothing to refund (credits were legitimately consumed)
    RETURN jsonb_build_object('success', true, 'refunded', 0, 'skipped', 'past_class');
  END IF;

  FOR v_b IN
    SELECT id, user_id, subscription_id, booked_at
    FROM public.class_bookings
    WHERE schedule_id = p_schedule_id AND status = 'confirmed'
    FOR UPDATE
  LOOP
    UPDATE public.class_bookings
    SET status = 'cancelled', cancelled_at = now(),
        cancellation_reason = 'Cours annulé par le studio', updated_at = now()
    WHERE id = v_b.id;

    PERFORM public.apply_credit_movement(
      v_b.subscription_id, 1, 'class_cancelled_refund',
      v_b.id, p_schedule_id, v_admin, v_b.booked_at);

    v_refunded := v_refunded + 1;
  END LOOP;

  -- Refund waitlist entries too (they paid at join)
  FOR v_b IN
    SELECT id, user_id, subscription_id, joined_at
    FROM public.class_waitlist
    WHERE schedule_id = p_schedule_id
    FOR UPDATE
  LOOP
    DELETE FROM public.class_waitlist WHERE id = v_b.id;
    PERFORM public.apply_credit_movement(
      v_b.subscription_id, 1, 'class_cancelled_waitlist_refund',
      NULL, p_schedule_id, v_admin, v_b.joined_at);
    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'refunded', v_refunded);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_schedule_bookings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_schedule_bookings(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. No-show flag / unflag
--     Penalty: 24h block on all booking. If the current window's opening rush
--     (first 24h after Sun/Wed 17:00 Casablanca) is still running the block
--     starts immediately; otherwise it starts at the next window opening.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flag_no_show(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking RECORD;
  v_last_open timestamptz;
  v_starts timestamptz;
  v_penalty_id uuid;
BEGIN
  IF NOT public.check_user_admin(v_admin) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized', 'message', 'Non autorisé');
  END IF;

  SELECT cb.id, cb.user_id, cb.status, cs.start_datetime
  INTO v_booking
  FROM public.class_bookings cb
  JOIN public.class_schedules cs ON cs.id = cb.schedule_id
  WHERE cb.id = p_booking_id
  FOR UPDATE OF cb;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Réservation non trouvée');
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status',
      'message', 'Seule une réservation confirmée peut être marquée absente');
  END IF;
  IF v_booking.start_datetime > now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'class_not_started',
      'message', 'Le cours n''a pas encore commencé');
  END IF;

  UPDATE public.class_bookings
  SET status = 'no_show', updated_at = now()
  WHERE id = p_booking_id;

  v_last_open := public.last_window_opening(now());
  IF v_last_open IS NOT NULL AND now() < v_last_open + interval '24 hours' THEN
    v_starts := now();
  ELSE
    v_starts := COALESCE(public.next_window_opening(now()), now());
  END IF;

  INSERT INTO public.no_show_penalties (user_id, booking_id, flagged_by, starts_at, expires_at)
  VALUES (v_booking.user_id, p_booking_id, v_admin, v_starts, v_starts + interval '24 hours')
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO v_penalty_id;

  RETURN jsonb_build_object('success', true, 'penalty_id', v_penalty_id,
    'starts_at', v_starts, 'expires_at', v_starts + interval '24 hours');
END;
$$;

CREATE OR REPLACE FUNCTION public.unflag_no_show(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking RECORD;
BEGIN
  IF NOT public.check_user_admin(v_admin) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized', 'message', 'Non autorisé');
  END IF;

  SELECT id, status INTO v_booking
  FROM public.class_bookings WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL OR v_booking.status <> 'no_show' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status',
      'message', 'Cette réservation n''est pas marquée absente');
  END IF;

  DELETE FROM public.no_show_penalties WHERE booking_id = p_booking_id;

  UPDATE public.class_bookings
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.flag_no_show(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unflag_no_show(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_no_show(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unflag_no_show(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 15. Remove the broken auto-promotion trigger. It has silently failed on
--     every cancellation since creation (it calls get_user_valid_subscription,
--     singular, which does not exist) and, if it ever started working, it
--     would deduct a second credit from users who already paid at join time.
--     Promotion now happens inside cancel_booking_v2 / handle_waitlist_promotion.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS promote_from_waitlist_trigger ON public.class_bookings;
DROP FUNCTION IF EXISTS public.promote_from_waitlist();

-- ----------------------------------------------------------------------------
-- 16. Capacity trigger: only enforce for FUTURE classes so that admin
--     corrections on past bookings (e.g. reverting a no-show) are possible.
--     Everything else is identical to the existing function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_capacity INT;
  v_current_bookings INT;
  v_start timestamptz;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status != 'confirmed') THEN
    -- Row-level lock on the schedule freezes concurrent requests
    SELECT cs.start_datetime INTO v_start
    FROM class_schedules cs WHERE cs.id = NEW.schedule_id
    FOR UPDATE;

    -- Capacity is only contested for classes that have not started yet
    IF v_start IS NOT NULL AND v_start > now() THEN
      SELECT COUNT(*) INTO v_current_bookings
      FROM class_bookings
      WHERE schedule_id = NEW.schedule_id AND status = 'confirmed';

      SELECT c.max_capacity INTO v_max_capacity
      FROM classes c
      JOIN class_schedules cs ON cs.class_id = c.id
      WHERE cs.id = NEW.schedule_id;

      IF v_current_bookings >= v_max_capacity THEN
        RAISE EXCEPTION 'Le cours a atteint sa capacité maximale.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 17. Harden existing leaky read functions (no behavior change for legit use)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_users_data(page_offset integer DEFAULT 0, page_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  total_count INTEGER;
BEGIN
  IF NOT public.check_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT COUNT(*) INTO total_count
  FROM public.profiles
  WHERE role != 'admin' OR role IS NULL;

  SELECT jsonb_build_object(
    'users', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'full_name', p.full_name,
          'phone', p.phone,
          'desired_plan', p.desired_plan,
          'subscription_status', p.subscription_status,
          'role', p.role,
          'created_at', p.created_at,
          'active_subscription', us_data.subscription_data
        ) ORDER BY p.created_at DESC
      )
      FROM public.profiles p
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', us.id,
          'status', us.status,
          'credits_remaining', us.credits_remaining,
          'end_date', us.end_date,
          'plan_name', sp.name
        ) as subscription_data
        FROM public.user_subscriptions us
        JOIN public.subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = p.id AND us.status = 'active'
        ORDER BY us.end_date DESC
        LIMIT 1
      ) us_data ON true
      WHERE (p.role != 'admin' OR p.role IS NULL)
      LIMIT page_limit OFFSET page_offset
    ),
    'total_count', total_count,
    'page_offset', page_offset,
    'page_limit', page_limit
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_users_data(integer, integer) FROM PUBLIC, anon;

-- get_user_dashboard_data: only the owner (or an admin) may read it
CREATE OR REPLACE FUNCTION public.get_user_dashboard_data(user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> user_uuid AND NOT public.check_user_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', id, 'email', email, 'full_name', full_name, 'phone', phone,
        'subscription_status', subscription_status, 'role', role
      )
      FROM public.profiles WHERE id = user_uuid
    ),
    'active_subscription', (
      SELECT jsonb_build_object(
        'id', us.id, 'status', us.status,
        'credits_remaining', us.credits_remaining,
        'weekly_credits_used', us.weekly_credits_used,
        'end_date', us.end_date, 'start_date', us.start_date,
        'plan', jsonb_build_object(
          'id', sp.id, 'name', sp.name, 'type', sp.type,
          'weekly_limit', sp.weekly_limit, 'credits', sp.credits, 'price_dhs', sp.price_dhs
        )
      )
      FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = user_uuid
        AND us.status = 'active'
        AND us.end_date > NOW()
      ORDER BY us.end_date DESC
      LIMIT 1
    ),
    'recent_bookings', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cb.id, 'status', cb.status, 'booked_at', cb.booked_at,
          'cancelled_at', cb.cancelled_at, 'class_title', c.title,
          'start_datetime', cs.start_datetime, 'end_datetime', cs.end_datetime,
          'coach', c.coach, 'location', c.location
        ) ORDER BY cb.booked_at DESC
      )
      FROM public.class_bookings cb
      JOIN public.class_schedules cs ON cb.schedule_id = cs.id
      JOIN public.classes c ON cs.class_id = c.id
      WHERE cb.user_id = user_uuid
      LIMIT 10
    ),
    'upcoming_classes', (
      SELECT jsonb_agg(
        upcoming_class ORDER BY (upcoming_class->>'start_datetime')::timestamp
      )
      FROM (
        SELECT jsonb_build_object(
          'id', cs.id, 'title', c.title, 'description', c.description,
          'start_datetime', cs.start_datetime, 'end_datetime', cs.end_datetime,
          'coach', c.coach, 'location', c.location,
          'difficulty_level', c.difficulty_level,
          'current_bookings', cs.current_bookings, 'max_capacity', c.max_capacity,
          'user_booked', (cb.id IS NOT NULL), 'user_booking_id', cb.id,
          'user_waitlist_position', cw.position
        ) as upcoming_class
        FROM public.class_schedules cs
        JOIN public.classes c ON cs.class_id = c.id
        LEFT JOIN public.class_bookings cb ON cs.id = cb.schedule_id AND cb.user_id = user_uuid AND cb.status = 'confirmed'
        LEFT JOIN public.class_waitlist cw ON cs.id = cw.schedule_id AND cw.user_id = user_uuid
        WHERE cs.start_datetime >= NOW()
          AND NOT cs.is_cancelled
          AND NOT cs.is_exception
        ORDER BY cs.start_datetime
        LIMIT 20
      ) subquery
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_dashboard_data(uuid) FROM PUBLIC, anon;

-- handle_waitlist_promotion: require an authenticated caller and a future class
CREATE OR REPLACE FUNCTION public.handle_waitlist_promotion(schedule_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  waitlist_entry RECORD;
  class_info RECORD;
  current_count INTEGER;
  new_booking_id UUID;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  SELECT c.max_capacity, cs.start_datetime INTO class_info
  FROM class_schedules cs
  JOIN classes c ON cs.class_id = c.id
  WHERE cs.id = schedule_uuid
  FOR UPDATE OF cs;

  IF class_info IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Class not found');
  END IF;

  IF class_info.start_datetime <= now() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Class already started');
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM class_bookings
  WHERE schedule_id = schedule_uuid AND status = 'confirmed';

  IF current_count >= class_info.max_capacity THEN
    RETURN jsonb_build_object('success', false, 'message', 'Class is still full',
      'current_bookings', current_count, 'max_capacity', class_info.max_capacity);
  END IF;

  SELECT * INTO waitlist_entry
  FROM class_waitlist
  WHERE schedule_id = schedule_uuid
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF waitlist_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No one in waitlist to promote');
  END IF;

  SELECT id INTO v_existing
  FROM class_bookings
  WHERE user_id = waitlist_entry.user_id AND schedule_id = schedule_uuid;

  IF v_existing IS NOT NULL THEN
    UPDATE class_bookings
    SET status = 'confirmed', subscription_id = waitlist_entry.subscription_id,
        cancelled_at = NULL, cancellation_reason = NULL, booked_at = now(), updated_at = now()
    WHERE id = v_existing
    RETURNING id INTO new_booking_id;
  ELSE
    INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
    VALUES (waitlist_entry.user_id, waitlist_entry.schedule_id, waitlist_entry.subscription_id, 'confirmed')
    RETURNING id INTO new_booking_id;
  END IF;

  DELETE FROM class_waitlist WHERE id = waitlist_entry.id;
  -- (adjust_waitlist_positions trigger renumbers the rest)

  -- No credit deduction here: the credit was paid when joining the waitlist.
  INSERT INTO public.credit_ledger
    (user_id, subscription_id, booking_id, schedule_id, field, delta, reason, created_by)
  VALUES
    (waitlist_entry.user_id, waitlist_entry.subscription_id, new_booking_id, schedule_uuid,
     'none', 0, 'waitlist_promotion_credit_paid_at_join', auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'User promoted from waitlist',
    'promoted_user_id', waitlist_entry.user_id, 'new_booking_id', new_booking_id);

EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error during promotion: ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.handle_waitlist_promotion(uuid) FROM PUBLIC, anon;

-- First anon lockdown of the self-service credit RPCs (the full lockdown of
-- authenticated callers happens post-deploy in the lockdown script).
REVOKE EXECUTE ON FUNCTION public.update_booking_credits(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_booking_credits(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_subscription_credits(uuid, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_refund(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.book_class(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_waitlists() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_weekly_credits() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_expired_subscriptions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_database_performance_stats() FROM anon;

-- NOTE: expire_subscriptions / cleanup_expired_waitlists keep their
-- `authenticated` grant until the cron routes switch to the service role
-- (same deploy); pg_cron jobs run as postgres and are unaffected.

-- ----------------------------------------------------------------------------
-- 18. DATA FIXES (production data changes — documented in the audit)
-- ----------------------------------------------------------------------------
-- 18a. Recompute the drifted current_bookings counters (5 rows today)
UPDATE public.class_schedules cs
SET current_bookings = sub.actual
FROM (
  SELECT cs2.id, COUNT(cb.id) FILTER (WHERE cb.status = 'confirmed') AS actual
  FROM public.class_schedules cs2
  LEFT JOIN public.class_bookings cb ON cb.schedule_id = cs2.id
  GROUP BY cs2.id
) sub
WHERE sub.id = cs.id
  AND cs.current_bookings IS DISTINCT FROM sub.actual;

-- 18b. Align the (display-only) settings with the actually enforced 3h rule
UPDATE public.admin_settings SET value = to_jsonb(3) WHERE key = 'cancellation_deadline_hours';
UPDATE public.admin_settings SET value = to_jsonb(3) WHERE key = 'min_cancellation_hours';

COMMIT;
