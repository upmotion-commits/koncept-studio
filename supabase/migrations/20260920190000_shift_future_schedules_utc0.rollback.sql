-- ============================================================================
-- Rollback for 20260920190000_shift_future_schedules_utc0.sql
-- ============================================================================
-- Subtracts the hour again from every class that has not started yet.
-- Run this only if the decision changes back to "the class moves to 16:30".
--
-- It refuses to run unless the shift is actually in place, so it cannot
-- silently move the timetable an hour earlier than it ever was.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_shifted integer;
  v_rows    integer;
BEGIN
  SELECT count(*) INTO v_shifted
    FROM public.class_schedules
   WHERE start_datetime > now()
     AND to_char(start_datetime, 'HH24:MI') IN ('08:30', '11:00', '18:30');

  IF v_shifted = 0 THEN
    RAISE EXCEPTION 'The shift is not in place — nothing to roll back.';
  END IF;

  UPDATE public.class_schedules
     SET start_datetime = start_datetime - interval '1 hour',
         end_datetime   = end_datetime   - interval '1 hour',
         updated_at     = now()
   WHERE start_datetime > now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE '✅ % schedules shifted back by 1 hour.', v_rows;
END $$;

COMMIT;
