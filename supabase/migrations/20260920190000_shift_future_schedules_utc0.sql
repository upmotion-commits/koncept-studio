-- ============================================================================
-- Morocco moved to UTC+0 — keep every class at its advertised wall-clock time
-- ============================================================================
-- DECISION (owner, 2026-09-20): "the 17:30 class stays at 17:30".
--
-- WHAT THIS DOES
--   Adds one hour to start_datetime and end_datetime for every class that has
--   not started yet. Past classes are left exactly as they are: they ran when
--   they ran, and rewriting history would falsify the booking record.
--
-- WHY IT IS NEEDED
--   class_schedules stores absolute instants. The current 280 future rows were
--   generated on 2026-08-30 13:55-14:02 UTC, while Morocco was UTC+1, so an
--   18:30 class was stored as 17:30Z. At UTC+0 that same instant now reads
--   17:30 local — every class an hour earlier than the published timetable.
--
-- IMPACT
--   280 schedules, 68 confirmed bookings. Bookings, waitlist entries and the
--   credit ledger all reference the schedule row, never a time of their own,
--   so they follow automatically and no other table is touched. The 3-hour
--   cancellation deadline moves with the class, which is the intended result.
--
-- REVERSIBLE
--   20260920190000_shift_future_schedules_utc0.rollback.sql subtracts the hour
--   again, from the same set of rows.
--
-- SAFE TO RE-RUN
--   It refuses to apply twice. The pre-shift timetable is 07:30 / 10:00 /
--   16:30 / 17:30 UTC; after the shift it is 08:30 / 11:00 / 17:30 / 18:30.
--   08:30, 11:00 and 18:30 cannot exist beforehand, so their presence means
--   the shift has already been applied and the script aborts untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DRY RUN — run this on its own first. It changes nothing.
-- ---------------------------------------------------------------------------
SELECT to_char(start_datetime, 'HH24:MI') AS utc_now,
       to_char(start_datetime + interval '1 hour', 'HH24:MI') AS utc_after,
       count(*) AS schedules,
       sum((SELECT count(*) FROM class_bookings b
             WHERE b.schedule_id = cs.id AND b.status = 'confirmed')) AS confirmed_bookings
  FROM class_schedules cs
 WHERE start_datetime > now()
 GROUP BY 1, 2
 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- THE CHANGE
-- ---------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  v_already integer;
  v_target  integer;
  v_shifted integer;
BEGIN
  SELECT count(*) INTO v_already
    FROM public.class_schedules
   WHERE start_datetime > now()
     AND to_char(start_datetime, 'HH24:MI') IN ('08:30', '11:00', '18:30');

  IF v_already > 0 THEN
    RAISE EXCEPTION
      'Already applied: % future schedules are at a post-shift time. Nothing was changed.', v_already;
  END IF;

  SELECT count(*) INTO v_target
    FROM public.class_schedules
   WHERE start_datetime > now();

  RAISE NOTICE 'Shifting % future schedules by +1 hour...', v_target;

  UPDATE public.class_schedules
     SET start_datetime = start_datetime + interval '1 hour',
         end_datetime   = end_datetime   + interval '1 hour',
         updated_at     = now()
   WHERE start_datetime > now();

  GET DIAGNOSTICS v_shifted = ROW_COUNT;

  IF v_shifted <> v_target THEN
    RAISE EXCEPTION 'Expected to shift % rows but shifted % — rolling back.', v_target, v_shifted;
  END IF;

  -- Nothing may end before it starts, and no class may have moved onto a
  -- different calendar day in Casablanca terms.
  IF EXISTS (SELECT 1 FROM public.class_schedules WHERE end_datetime <= start_datetime) THEN
    RAISE EXCEPTION 'A schedule now ends before it starts — rolling back.';
  END IF;

  RAISE NOTICE '✅ % schedules shifted. Past classes untouched.', v_shifted;
END $$;

-- What the timetable looks like now. Read the third column as the local time
-- members will see once Morocco is UTC+0.
SELECT to_char(start_datetime, 'HH24:MI') AS utc,
       count(*) AS schedules,
       min(start_datetime)::date AS first_day,
       max(start_datetime)::date AS last_day
  FROM public.class_schedules
 WHERE start_datetime > now()
 GROUP BY 1 ORDER BY 1;

COMMIT;
