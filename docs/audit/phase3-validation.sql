-- ============================================================================
-- PHASE 3 — VALIDATION / REGRESSION TESTS
-- Run in the Supabase SQL Editor AFTER 20260830100000_phase3_core.sql and
-- 20260903120000_waitlist_promotion_notices.sql.
--
-- Section A executes real end-to-end scenarios (booking, capacity, waitlist,
-- refunds, promotion, no-show penalties) inside ONE transaction that is ALWAYS
-- rolled back — nothing persists, whether it passes or fails.
-- If everything is correct you get:  NOTICE  ✅ ALL PHASE 3 TESTS PASSED
-- If an invariant is broken the script stops with a descriptive exception.
--
-- Section B (bottom, read-only) can be run any time to check production
-- invariants.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_class uuid;
  v_sched uuid;         -- future class, capacity 2
  v_sched_past uuid;    -- past class (for no-show tests)
  v_user_a RECORD;
  v_user_b RECORD;
  v_user_c RECORD;
  v_admin uuid;
  v_r jsonb;
  v_booking_a uuid;
  v_booking_past uuid;
  v_waitlist_c uuid;
  v_n integer;
  v_before integer;
  v_after integer;
BEGIN
  -- ------------------------------------------------------------------ fixtures
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'FIXTURE: no admin profile found'; END IF;

  -- Three distinct NON-ADMIN users holding an active abonnement with weekly
  -- room. The role filter matters: a staff account with a real abonnement
  -- would otherwise be picked as a "member" fixture and silently pass the
  -- authorization tests below.
  SELECT us.user_id, us.id AS sub_id, us.weekly_credits_used
  INTO v_user_a
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  JOIN profiles pr ON pr.id = us.user_id AND pr.role <> 'admin'
  WHERE us.status = 'active' AND us.end_date > now() + interval '3 days'
    AND sp.type = 'abonnement' AND us.weekly_credits_used < sp.weekly_limit
    AND (SELECT count(*) FROM user_subscriptions x
         WHERE x.user_id = us.user_id AND x.status = 'active' AND x.end_date > now()) = 1
  ORDER BY us.created_at LIMIT 1;

  SELECT us.user_id, us.id AS sub_id, us.weekly_credits_used
  INTO v_user_b
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  JOIN profiles pr ON pr.id = us.user_id AND pr.role <> 'admin'
  WHERE us.status = 'active' AND us.end_date > now() + interval '3 days'
    AND sp.type = 'abonnement' AND us.weekly_credits_used < sp.weekly_limit
    AND (SELECT count(*) FROM user_subscriptions x
         WHERE x.user_id = us.user_id AND x.status = 'active' AND x.end_date > now()) = 1
    AND us.user_id <> v_user_a.user_id
  ORDER BY us.created_at LIMIT 1;

  SELECT us.user_id, us.id AS sub_id, us.weekly_credits_used
  INTO v_user_c
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  JOIN profiles pr ON pr.id = us.user_id AND pr.role <> 'admin'
  WHERE us.status = 'active' AND us.end_date > now() + interval '3 days'
    AND sp.type = 'abonnement' AND us.weekly_credits_used < sp.weekly_limit
    AND (SELECT count(*) FROM user_subscriptions x
         WHERE x.user_id = us.user_id AND x.status = 'active' AND x.end_date > now()) = 1
    AND us.user_id NOT IN (v_user_a.user_id, v_user_b.user_id)
  ORDER BY us.created_at LIMIT 1;

  IF v_user_c.user_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: need 3 non-admin users with active abonnement and weekly room';
  END IF;

  INSERT INTO classes (title, description, duration, max_capacity, coach, location, difficulty_level)
  VALUES ('TEST — validation (rolled back)', 'temp', 45, 2, 'Test', 'Test', 'all_levels')
  RETURNING id INTO v_class;

  INSERT INTO class_schedules (class_id, start_datetime, end_datetime)
  VALUES (v_class, now() + interval '2 days', now() + interval '2 days' + interval '45 minutes')
  RETURNING id INTO v_sched;

  INSERT INTO class_schedules (class_id, start_datetime, end_datetime)
  VALUES (v_class, now() - interval '2 hours', now() - interval '75 minutes')
  RETURNING id INTO v_sched_past;

  -- ------------------------------------------------- T1: booking consumes credit
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a.user_id, 'role', 'authenticated')::text, true);
  v_r := public.book_class_v2(v_sched);
  IF NOT (v_r->>'success')::boolean THEN
    RAISE EXCEPTION 'T1 FAILED: booking refused: %', v_r->>'message';
  END IF;
  v_booking_a := (v_r->>'booking_id')::uuid;

  SELECT weekly_credits_used INTO v_after FROM user_subscriptions WHERE id = v_user_a.sub_id;
  IF v_after <> v_user_a.weekly_credits_used + 1 THEN
    RAISE EXCEPTION 'T1 FAILED: weekly_credits_used not incremented (% -> %)', v_user_a.weekly_credits_used, v_after;
  END IF;
  SELECT count(*) INTO v_n FROM credit_ledger WHERE booking_id = v_booking_a AND reason = 'booking';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAILED: no ledger entry for booking'; END IF;

  -- ------------------------------------------------- T2: duplicate booking refused
  v_r := public.book_class_v2(v_sched);
  IF (v_r->>'success')::boolean OR v_r->>'reason' <> 'already_booked' THEN
    RAISE EXCEPTION 'T2 FAILED: duplicate booking not refused: %', v_r;
  END IF;

  -- ------------------------------------------------- T3: capacity enforced at 2/2
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_b.user_id, 'role', 'authenticated')::text, true);
  v_r := public.book_class_v2(v_sched);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T3 FAILED: second booking refused: %', v_r; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_c.user_id, 'role', 'authenticated')::text, true);
  v_r := public.book_class_v2(v_sched);
  IF (v_r->>'success')::boolean OR v_r->>'reason' <> 'class_full' THEN
    RAISE EXCEPTION 'T3 FAILED: overbooking was allowed: %', v_r;
  END IF;

  -- ------------------------------------------------- T4: waitlist join (real count) + credit
  v_before := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_c.sub_id);
  v_r := public.join_waitlist_v2(v_sched);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T4 FAILED: waitlist join refused: %', v_r; END IF;
  v_waitlist_c := (v_r->>'waitlist_id')::uuid;
  IF (SELECT position FROM class_waitlist WHERE id = v_waitlist_c) <> 1 THEN
    RAISE EXCEPTION 'T4 FAILED: waitlist position is not 1';
  END IF;
  v_after := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_c.sub_id);
  IF v_after <> v_before + 1 THEN RAISE EXCEPTION 'T4 FAILED: waitlist join did not consume a credit'; END IF;

  -- ------------------------------------------------- T5: cancel refunds + promotes WITHOUT double charge
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a.user_id, 'role', 'authenticated')::text, true);
  v_before := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_a.sub_id);
  v_r := public.cancel_booking_v2(v_booking_a);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T5 FAILED: cancel refused: %', v_r; END IF;
  IF (v_r->>'promoted_user_id')::uuid IS DISTINCT FROM v_user_c.user_id THEN
    RAISE EXCEPTION 'T5 FAILED: waitlist head was not promoted';
  END IF;
  v_after := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_a.sub_id);
  IF v_after <> v_before - 1 THEN RAISE EXCEPTION 'T5 FAILED: cancellation did not refund the weekly credit'; END IF;

  -- promoted user must NOT be charged again (paid at join)
  IF (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_c.sub_id)
     <> v_user_c.weekly_credits_used + 1 THEN
    RAISE EXCEPTION 'T5 FAILED: promotion double-charged the promoted user';
  END IF;
  IF EXISTS (SELECT 1 FROM class_waitlist WHERE schedule_id = v_sched) THEN
    RAISE EXCEPTION 'T5 FAILED: waitlist entry not removed after promotion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM class_bookings
                 WHERE schedule_id = v_sched AND user_id = v_user_c.user_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'T5 FAILED: promoted booking missing';
  END IF;

  -- T5b: the promotion must have queued a notice, in this same transaction,
  -- pointing at the promoted booking and still undelivered.
  IF NOT EXISTS (
    SELECT 1 FROM waitlist_promotion_notices n
     WHERE n.user_id = v_user_c.user_id
       AND n.schedule_id = v_sched
       AND n.notified_at IS NULL
       AND n.claimed_at IS NULL
       AND n.attempts = 0
       AND n.booking_id = (SELECT id FROM class_bookings
                            WHERE schedule_id = v_sched
                              AND user_id = v_user_c.user_id
                              AND status = 'confirmed')
  ) THEN
    RAISE EXCEPTION 'T5b FAILED: promotion did not queue a notice for the promoted member';
  END IF;
  IF (SELECT count(*) FROM waitlist_promotion_notices
       WHERE schedule_id = v_sched) <> 1 THEN
    RAISE EXCEPTION 'T5b FAILED: expected exactly one notice for this class';
  END IF;

  -- ------------------------------------------------- T6: cancel deadline (3h) enforced server-side
  INSERT INTO class_schedules (class_id, start_datetime, end_datetime)
  VALUES (v_class, now() + interval '90 minutes', now() + interval '135 minutes')
  RETURNING id INTO v_booking_past; -- reuse var as temp schedule id
  INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
  VALUES (v_user_a.user_id, v_booking_past, v_user_a.sub_id, 'confirmed')
  RETURNING id INTO v_booking_a;
  v_r := public.cancel_booking_v2(v_booking_a);
  IF (v_r->>'success')::boolean OR v_r->>'reason' <> 'too_late' THEN
    RAISE EXCEPTION 'T6 FAILED: late cancellation was allowed: %', v_r;
  END IF;

  -- ------------------------------------------------- T7: no-show flag + 24h penalty blocks booking
  INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
  VALUES (v_user_b.user_id, v_sched_past, v_user_b.sub_id, 'confirmed')
  RETURNING id INTO v_booking_past;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.flag_no_show(v_booking_past);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T7 FAILED: flag_no_show refused: %', v_r; END IF;
  IF (SELECT status FROM class_bookings WHERE id = v_booking_past) <> 'no_show' THEN
    RAISE EXCEPTION 'T7 FAILED: booking not marked no_show';
  END IF;
  SELECT count(*) INTO v_n FROM no_show_penalties WHERE booking_id = v_booking_past;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T7 FAILED: penalty row missing'; END IF;

  -- duplicate flag must not create a second penalty
  UPDATE class_bookings SET status = 'confirmed' WHERE id = v_booking_past;
  v_r := public.flag_no_show(v_booking_past);
  SELECT count(*) INTO v_n FROM no_show_penalties WHERE booking_id = v_booking_past;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T7 FAILED: duplicate penalty created'; END IF;

  -- while the penalty is active (if it starts now), booking is blocked
  IF (SELECT starts_at <= now() FROM no_show_penalties WHERE booking_id = v_booking_past) THEN
    PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_b.user_id, 'role', 'authenticated')::text, true);
    v_r := public.book_class_v2(v_sched);
    IF v_r->>'reason' IS DISTINCT FROM 'no_show_penalty' THEN
      RAISE EXCEPTION 'T7 FAILED: penalized user was not blocked: %', v_r;
    END IF;
  END IF;

  -- ------------------------------------------------- T8: unflag restores + removes penalty
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.unflag_no_show(v_booking_past);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T8 FAILED: unflag refused: %', v_r; END IF;
  IF EXISTS (SELECT 1 FROM no_show_penalties WHERE booking_id = v_booking_past) THEN
    RAISE EXCEPTION 'T8 FAILED: penalty not deleted';
  END IF;
  IF (SELECT status FROM class_bookings WHERE id = v_booking_past) <> 'confirmed' THEN
    RAISE EXCEPTION 'T8 FAILED: booking not restored to confirmed';
  END IF;

  -- ------------------------------------------------- T9: leave waitlist refunds atomically
  INSERT INTO class_schedules (class_id, start_datetime, end_datetime)
  VALUES (v_class, now() + interval '3 days', now() + interval '3 days' + interval '45 minutes')
  RETURNING id INTO v_sched;
  -- fill it (capacity 2) directly
  INSERT INTO class_bookings (user_id, schedule_id, subscription_id, status)
  VALUES (v_user_a.user_id, v_sched, v_user_a.sub_id, 'confirmed'),
         (v_user_b.user_id, v_sched, v_user_b.sub_id, 'confirmed');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_c.user_id, 'role', 'authenticated')::text, true);
  v_before := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_c.sub_id);
  v_r := public.join_waitlist_v2(v_sched);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T9 FAILED: join refused: %', v_r; END IF;
  v_r := public.leave_waitlist_v2((v_r->>'waitlist_id')::uuid);
  IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'T9 FAILED: leave refused: %', v_r; END IF;
  v_after := (SELECT weekly_credits_used FROM user_subscriptions WHERE id = v_user_c.sub_id);
  IF v_after <> v_before THEN RAISE EXCEPTION 'T9 FAILED: leave did not refund the join credit'; END IF;

  -- ------------------------------------------- T10: notice enqueue is admin-only
  -- A member must not be able to make the studio WhatsApp an arbitrary user.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a.user_id, 'role', 'authenticated')::text, true);
  v_r := public.enqueue_waitlist_promotion_notice(v_user_b.user_id, v_sched, NULL);
  IF (v_r->>'success')::boolean THEN
    RAISE EXCEPTION 'T10 FAILED: a non-admin could queue a promotion notice';
  END IF;
  IF v_r->>'reason' <> 'not_admin' THEN
    RAISE EXCEPTION 'T10 FAILED: wrong refusal reason: %', v_r;
  END IF;

  -- and an admin must not be able to announce a place the member does not hold
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.enqueue_waitlist_promotion_notice(v_user_c.user_id, v_sched, NULL);
  IF (v_r->>'success')::boolean THEN
    RAISE EXCEPTION 'T10 FAILED: notice queued for a member with no confirmed booking';
  END IF;
  IF v_r->>'reason' <> 'no_confirmed_booking' THEN
    RAISE EXCEPTION 'T10 FAILED: wrong refusal reason: %', v_r;
  END IF;

  RAISE NOTICE '✅ ALL PHASE 3 TESTS PASSED (transaction will be rolled back — nothing persisted)';
END;
$$;

ROLLBACK;

-- ============================================================================
-- SECTION B — read-only production invariants (safe to run any time)
-- All four queries must return zero rows.
-- ============================================================================

-- B1. No FUTURE schedule may exceed its capacity
SELECT cs.id, cs.start_datetime, c.title, c.max_capacity,
       count(cb.id) AS confirmed
FROM class_schedules cs
JOIN classes c ON c.id = cs.class_id
LEFT JOIN class_bookings cb ON cb.schedule_id = cs.id AND cb.status = 'confirmed'
WHERE cs.start_datetime > now()
GROUP BY cs.id, cs.start_datetime, c.title, c.max_capacity
HAVING count(cb.id) > c.max_capacity;

-- B2. current_bookings counter must match the real confirmed count
SELECT cs.id, cs.start_datetime, cs.current_bookings,
       (SELECT count(*) FROM class_bookings cb
        WHERE cb.schedule_id = cs.id AND cb.status = 'confirmed') AS actual
FROM class_schedules cs
WHERE cs.current_bookings IS DISTINCT FROM
      (SELECT count(*) FROM class_bookings cb
       WHERE cb.schedule_id = cs.id AND cb.status = 'confirmed');

-- B3. No active abonnement may exceed its weekly limit
SELECT us.id, us.user_id, us.weekly_credits_used, sp.weekly_limit
FROM user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
WHERE us.status = 'active' AND sp.type = 'abonnement'
  AND sp.weekly_limit IS NOT NULL
  AND us.weekly_credits_used > sp.weekly_limit;

-- B4. Nobody may hold a place won from the waitlist without having been told.
--     Rows here are promotions whose notice is stuck: either the worker has
--     never run, or it exhausted its retries (see last_error).
SELECT n.id, n.user_id, p.full_name, p.phone, c.title, cs.start_datetime,
       n.promoted_at, n.attempts, n.last_error
FROM waitlist_promotion_notices n
JOIN profiles p          ON p.id  = n.user_id
JOIN class_schedules cs  ON cs.id = n.schedule_id
JOIN classes c           ON c.id  = cs.class_id
WHERE n.notified_at IS NULL
  AND n.promoted_at < now() - interval '1 hour';
