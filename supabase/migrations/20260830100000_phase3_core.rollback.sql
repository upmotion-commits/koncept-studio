-- ============================================================================
-- ROLLBACK for 20260830100000_phase3_core.sql
-- Run only if the Phase 3 deployment must be reverted. Restores every replaced
-- function to its pre-migration definition (taken from the 2026-08-30 catalog
-- dump) and removes the new objects. The 5 recomputed current_bookings rows
-- and the 2 settings values are corrections of wrong data — this script leaves
-- the corrected values in place (reverting them would reintroduce wrong data);
-- the "before" values are documented in docs/PHASE1_AUDIT.md.
-- ============================================================================

BEGIN;

-- 1. Drop new functions
DROP FUNCTION IF EXISTS public.book_class_v2(uuid);
DROP FUNCTION IF EXISTS public.cancel_booking_v2(uuid);
DROP FUNCTION IF EXISTS public.join_waitlist_v2(uuid);
DROP FUNCTION IF EXISTS public.leave_waitlist_v2(uuid);
DROP FUNCTION IF EXISTS public.admin_book_class_v2(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_refund_schedule_bookings(uuid);
DROP FUNCTION IF EXISTS public.flag_no_show(uuid);
DROP FUNCTION IF EXISTS public.unflag_no_show(uuid);
DROP FUNCTION IF EXISTS public.apply_credit_movement(uuid, integer, text, uuid, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.pick_booking_subscription(uuid);
DROP FUNCTION IF EXISTS public.active_penalty_until(uuid);
DROP FUNCTION IF EXISTS public.last_window_opening(timestamptz);
DROP FUNCTION IF EXISTS public.next_window_opening(timestamptz);

-- 2. Drop new tables (WARNING: destroys ledger/penalty/notification history
--    accumulated since the migration ran)
DROP TABLE IF EXISTS public.no_show_penalties;
DROP TABLE IF EXISTS public.credit_ledger;
DROP TABLE IF EXISTS public.notification_log;

-- 3. Restore whatsapp_logs event_type check (pre-migration list)
ALTER TABLE public.whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_event_type_check;
ALTER TABLE public.whatsapp_logs ADD CONSTRAINT whatsapp_logs_event_type_check
  CHECK (event_type = ANY (ARRAY['signup'::text, 'activation'::text,
    'waitlist_promotion'::text, 'class_cancellation'::text, 'subscription_request'::text]));

-- 4. Restore the original capacity trigger function (checked past classes too)
CREATE OR REPLACE FUNCTION public.check_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_max_capacity INT;
  v_current_bookings INT;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status != 'confirmed') THEN
    PERFORM 1 FROM class_schedules WHERE id = NEW.schedule_id FOR UPDATE;

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

  RETURN NEW;
END;
$function$;

-- 5. Recreate the old promotion trigger exactly as it was (note: it was
--    non-functional — it references get_user_valid_subscription which does
--    not exist — but this restores the pre-migration state faithfully).
CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  waitlist_entry RECORD;
  subscription_record RECORD;
  class_schedule_record RECORD;
  class_record RECORD;
  current_bookings INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
    SELECT * INTO class_schedule_record FROM class_schedules WHERE id = NEW.schedule_id FOR UPDATE;
    SELECT * INTO class_record FROM classes WHERE id = class_schedule_record.class_id;
    SELECT COUNT(*) INTO current_bookings
    FROM class_bookings WHERE schedule_id = NEW.schedule_id AND status = 'confirmed' FOR UPDATE;

    IF current_bookings < class_record.max_capacity THEN
      SELECT * INTO waitlist_entry FROM class_waitlist
      WHERE schedule_id = NEW.schedule_id ORDER BY position ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF waitlist_entry IS NOT NULL THEN
        SELECT * INTO subscription_record
        FROM get_user_valid_subscription(waitlist_entry.user_id)
        WHERE id = waitlist_entry.subscription_id LIMIT 1;

        IF subscription_record IS NOT NULL THEN
          INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
          VALUES (waitlist_entry.user_id, waitlist_entry.schedule_id, waitlist_entry.subscription_id, 'confirmed');

          IF subscription_record.plan_type = 'abonnement' THEN
            UPDATE user_subscriptions SET weekly_credits_used = weekly_credits_used + 1
            WHERE id = subscription_record.id;
          ELSE
            UPDATE user_subscriptions
            SET credits_remaining = credits_remaining - 1, credits_used = credits_used + 1
            WHERE id = subscription_record.id;
          END IF;

          DELETE FROM class_waitlist WHERE id = waitlist_entry.id;
          UPDATE class_waitlist SET position = position - 1
          WHERE schedule_id = NEW.schedule_id AND position > waitlist_entry.position;
        END IF;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    SELECT * INTO class_schedule_record FROM class_schedules WHERE id = OLD.schedule_id FOR UPDATE;
    SELECT * INTO class_record FROM classes WHERE id = class_schedule_record.class_id;
    SELECT COUNT(*) INTO current_bookings
    FROM class_bookings WHERE schedule_id = OLD.schedule_id AND status = 'confirmed' FOR UPDATE;

    IF current_bookings < class_record.max_capacity THEN
      SELECT * INTO waitlist_entry FROM class_waitlist
      WHERE schedule_id = OLD.schedule_id ORDER BY position ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF waitlist_entry IS NOT NULL THEN
        SELECT * INTO subscription_record
        FROM get_user_valid_subscription(waitlist_entry.user_id)
        WHERE id = waitlist_entry.subscription_id LIMIT 1;

        IF subscription_record IS NOT NULL THEN
          INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
          VALUES (waitlist_entry.user_id, waitlist_entry.schedule_id, waitlist_entry.subscription_id, 'confirmed');

          IF subscription_record.plan_type = 'abonnement' THEN
            UPDATE user_subscriptions SET weekly_credits_used = weekly_credits_used + 1
            WHERE id = subscription_record.id;
          ELSE
            UPDATE user_subscriptions
            SET credits_remaining = credits_remaining - 1, credits_used = credits_used + 1
            WHERE id = subscription_record.id;
          END IF;

          DELETE FROM class_waitlist WHERE id = waitlist_entry.id;
          UPDATE class_waitlist SET position = position - 1
          WHERE schedule_id = OLD.schedule_id AND position > waitlist_entry.position;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);

EXCEPTION
  WHEN others THEN
    RAISE LOG 'Error in promote_from_waitlist trigger: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER promote_from_waitlist_trigger
  AFTER DELETE OR UPDATE ON public.class_bookings
  FOR EACH ROW EXECUTE FUNCTION public.promote_from_waitlist();

-- 6. Restore permissive grants removed in the core migration
GRANT EXECUTE ON FUNCTION public.update_booking_credits(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.refund_booking_credits(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_subscription_credits(uuid, integer, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_and_refund(uuid, uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_waitlists() TO anon;
GRANT EXECUTE ON FUNCTION public.reset_weekly_credits() TO anon;
GRANT EXECUTE ON FUNCTION public.check_expired_subscriptions() TO anon;
GRANT EXECUTE ON FUNCTION public.get_database_performance_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_data(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_data(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_waitlist_promotion(uuid) TO anon;

-- NOTE: the hardened bodies of get_admin_users_data / get_user_dashboard_data /
-- handle_waitlist_promotion are intentionally NOT reverted: the added
-- authorization checks close a data leak and do not affect legitimate callers.

COMMIT;
