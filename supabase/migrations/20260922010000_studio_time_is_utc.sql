-- ============================================================================
-- Morocco is permanently UTC+0 — take the timezone database out of the loop
-- ============================================================================
-- Decision (owner, 2026-09-22): Morocco has settled on UTC+0 with no further
-- seasonal or Ramadan changes.
--
-- WHAT THIS DOES
--   Replaces every `AT TIME ZONE 'Africa/Casablanca'` in the booking-window
--   helpers and the no-show penalty messages with UTC. Studio local time and
--   UTC are now the same clock, permanently, so the conversion is the identity
--   and naming a zone only adds a dependency that can be wrong.
--
-- WHY IT IS NEEDED
--   `Africa/Casablanca` is resolved from the database server's copy of the
--   IANA timezone data. Supabase's copy still places Morocco at UTC+1, so
--   last_window_opening() has been returning 16:00Z for "Sunday 17:00" — an
--   hour early — and it would keep doing so until Supabase ships new zone
--   rules. Since the offset is now fixed forever, waiting for that is pointless.
--
-- BEHAVIOUR CHANGE
--   last_window_opening() / next_window_opening() move one hour later, from
--   16:00Z to 17:00Z. They feed no-show penalty timing only — never booking
--   access — so nothing a member can do changes. Penalty messages will name
--   the correct hour.
--
-- Also reschedules the Sunday weekly-credit reset, which was pinned to 16:00
-- UTC to land on 17:00 Casablanca at UTC+1. At UTC+0 that is 17:00 UTC.
--
-- Idempotent and reversible (.rollback.sql restores the zone-name versions).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Booking-window helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.last_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  local_ts timestamp;  -- studio wall-clock time, which is UTC
  dow int;             -- 0=Sun .. 6=Sat
  candidate timestamp;
  best timestamp := NULL;
  d int;
BEGIN
  -- Morocco is permanently UTC+0: studio wall clock == UTC. Naming the zone
  -- here would reintroduce a dependency on the server's tzdata, which is the
  -- exact thing that made this function an hour early.
  local_ts := p_at AT TIME ZONE 'UTC';
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', local_ts) - make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate <= local_ts AND dow IN (0, 3) THEN
      best := candidate;
      EXIT;
    END IF;
  END LOOP;
  RETURN best AT TIME ZONE 'UTC';
END;
$$;

CREATE OR REPLACE FUNCTION public.next_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  local_ts timestamp;
  dow int;
  candidate timestamp;
  d int;
BEGIN
  local_ts := p_at AT TIME ZONE 'UTC';
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', local_ts) + make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate > local_ts AND dow IN (0, 3) THEN
      RETURN candidate AT TIME ZONE 'UTC';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.last_window_opening(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_window_opening(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_window_opening(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_window_opening(timestamptz) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Penalty messages name the studio's hour
-- ----------------------------------------------------------------------------
DO $migrate$
DECLARE
  fn text;
  src text;
  updated int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['book_class_v2', 'join_waitlist_v2'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn
     LIMIT 1;

    IF src IS NULL THEN
      RAISE NOTICE 'skipped %: not found', fn;
      CONTINUE;
    END IF;

    IF position('AT TIME ZONE ''Africa/Casablanca''' in src) = 0 THEN
      RAISE NOTICE 'skipped %: already on UTC', fn;
      CONTINUE;
    END IF;

    EXECUTE replace(src, 'AT TIME ZONE ''Africa/Casablanca''', 'AT TIME ZONE ''UTC''');
    updated := updated + 1;
    RAISE NOTICE 'rewrote % to use UTC', fn;
  END LOOP;

  RAISE NOTICE '% function(s) rewritten', updated;
END $migrate$;

-- ----------------------------------------------------------------------------
-- 3. Sunday weekly-credit reset: 16:00 UTC -> 17:00 UTC
--    (both were meant to be 17:00 at the studio)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  j RECORD;
  n int := 0;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not installed — skipping the weekly reset reschedule';
    RETURN;
  END IF;

  FOR j IN SELECT jobid, jobname, schedule FROM cron.job LOOP
    RAISE NOTICE 'cron job % (%) currently: %', j.jobid, coalesce(j.jobname, '-'), j.schedule;
  END LOOP;

  BEGIN
    UPDATE cron.job
       SET schedule = '0 17 * * 0'
     WHERE schedule = '0 16 * * 0';
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Cannot write cron.job from this role. Run manually as the postgres user: UPDATE cron.job SET schedule = ''0 17 * * 0'' WHERE schedule = ''0 16 * * 0'';';
    RETURN;
  END;

  IF n = 0 THEN
    RAISE WARNING 'No job on 0 16 * * 0 — nothing rescheduled. Either it is already done, or the weekly reset uses a different schedule: check the list above and move it to 17:00 UTC by hand.';
  ELSE
    RAISE NOTICE '✅ % weekly-reset job(s) moved to 17:00 UTC = 17:00 at the studio', n;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Verify
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  last_open timestamptz := public.last_window_opening(now());
  next_open timestamptz := public.next_window_opening(now());
BEGIN
  ASSERT to_char(last_open AT TIME ZONE 'UTC', 'HH24:MI') = '17:00',
    format('last_window_opening returned %s — expected 17:00 UTC', last_open);
  ASSERT to_char(next_open AT TIME ZONE 'UTC', 'HH24:MI') = '17:00',
    format('next_window_opening returned %s — expected 17:00 UTC', next_open);
  ASSERT EXTRACT(DOW FROM last_open AT TIME ZONE 'UTC')::int IN (0, 3),
    'last_window_opening did not land on a Sunday or Wednesday';
  RAISE NOTICE '✅ windows now open at % and next at % (17:00 studio time)', last_open, next_open;
END $$;
