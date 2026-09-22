-- ============================================================================
-- Rollback for 20260922010000_studio_time_is_utc.sql
-- ============================================================================
-- Puts the booking-window helpers and the penalty messages back on the
-- Africa/Casablanca zone name, and returns the weekly reset to 16:00 UTC.
-- Only run this if Morocco reverses the permanent-UTC+0 decision AND the
-- database's timezone data has been updated to match.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.last_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  casa timestamp; dow int; candidate timestamp; best timestamp := NULL; d int;
BEGIN
  casa := p_at AT TIME ZONE 'Africa/Casablanca';
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', casa) - make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate <= casa AND dow IN (0, 3) THEN best := candidate; EXIT; END IF;
  END LOOP;
  RETURN best AT TIME ZONE 'Africa/Casablanca';
END;
$$;

CREATE OR REPLACE FUNCTION public.next_window_opening(p_at timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  casa timestamp; dow int; candidate timestamp; d int;
BEGIN
  casa := p_at AT TIME ZONE 'Africa/Casablanca';
  FOR d IN 0..7 LOOP
    candidate := date_trunc('day', casa) + make_interval(days => d) + interval '17 hours';
    dow := EXTRACT(DOW FROM candidate)::int;
    IF candidate > casa AND dow IN (0, 3) THEN RETURN candidate AT TIME ZONE 'Africa/Casablanca'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.last_window_opening(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_window_opening(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_window_opening(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_window_opening(timestamptz) TO authenticated, service_role;

DO $$
DECLARE fn text; src text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['book_class_v2', 'join_waitlist_v2'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn LIMIT 1;
    IF src IS NOT NULL AND position('AT TIME ZONE ''UTC''' in src) > 0 THEN
      EXECUTE replace(src, 'AT TIME ZONE ''UTC''', 'AT TIME ZONE ''Africa/Casablanca''');
      RAISE NOTICE 'reverted %', fn;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    UPDATE cron.job SET schedule = '0 16 * * 0' WHERE schedule = '0 17 * * 0';
  END IF;
END $$;
