-- ============================================================================
-- Rollback for 20260903120000_waitlist_promotion_notices.sql
-- ============================================================================
-- Restores cancel_booking_v2 to its 20260830100000_phase3_core.sql definition
-- and drops the outbox. Run this only together with reverting the application
-- deploy: the reverted app expects the pre-notice function shape (it reads
-- `promoted_user_id`, which both versions return, so either order is safe).
-- ============================================================================

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

DROP FUNCTION IF EXISTS public.enqueue_waitlist_promotion_notice(uuid, uuid, uuid);

-- Undelivered notices are lost with the table. Check before dropping:
--   SELECT count(*) FROM public.waitlist_promotion_notices WHERE notified_at IS NULL;
DROP TABLE IF EXISTS public.waitlist_promotion_notices;
