-- ============================================================================
-- Koncept Studio — read-only visibility dump 2/2 (scheduled jobs)
-- Safe to run: SELECT only.
-- If this errors with `relation "cron.job" does not exist`, pg_cron is not
-- installed — just tell me that instead of pasting a result.
-- ============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'jobs', (
     SELECT jsonb_agg(to_jsonb(j) ORDER BY j.jobid)
     FROM cron.job j
  ),
  'recent_runs', (
     SELECT jsonb_agg(to_jsonb(r) ORDER BY r.start_time DESC)
     FROM (
       SELECT jobid, jobname, status, return_message, start_time, end_time
       FROM cron.job_run_details
       ORDER BY start_time DESC
       LIMIT 60
     ) r
  )
));
