-- ============================================================================
-- Koncept Studio — revenue report (READ ONLY)
-- ============================================================================
-- Reproduces the figures in the 2026-08-30 revenue breakdown.
-- Contains no INSERT/UPDATE/DELETE/ALTER. Safe to run on production.
--
-- METHOD AND ITS LIMITS
--   The database has no payments/invoices/transactions table. Revenue is
--   *attributed*: every user_subscriptions row is valued at the CURRENT
--   subscription_plans.price_dhs and booked to the month of start_date.
--   Consequences:
--     - discounts, instalments, refunds and unpaid subscriptions are invisible;
--     - subscription_plans stores one mutable price with no history, so a past
--       price change silently revalues every earlier subscription
--       (4 plans were edited 2026-05-31, Koncept Elite 2026-07-08);
--     - this is gross sales, an upper bound, not collected cash.
--   Fixing this needs two things: a payments table, and a price_paid column
--   snapshotted onto user_subscriptions at purchase time.
-- ============================================================================

-- Rows excluded from "member revenue": test accounts, staff/owner accounts,
-- and one duplicate contract (the same Koncept Prime entered twice after the
-- member's account was re-created; bookings on the two accounts do not overlap).
WITH excluded_users AS (
  SELECT id, 'test'  AS reason FROM profiles
   WHERE email IN ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com')
  UNION ALL
  SELECT id, 'staff' AS reason FROM profiles
   WHERE email IN ('salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')
),
duplicate_subs AS (
  SELECT s.id
    FROM user_subscriptions s
    JOIN profiles p ON p.id = s.user_id
   WHERE p.email = 'khadijaelhaitem@gmail.com'   -- superseded account, contract re-entered
),
member_revenue AS (
  SELECT s.*, pl.name AS plan_name, pl.type AS plan_type, pl.price_dhs
    FROM user_subscriptions s
    JOIN subscription_plans pl ON pl.id = s.plan_id
   WHERE s.user_id NOT IN (SELECT id FROM excluded_users)
     AND s.id      NOT IN (SELECT id FROM duplicate_subs)
)

-- ---------------------------------------------------------------- 1. total
SELECT 'TOTAL' AS section, count(*) AS subscriptions, sum(price_dhs) AS dhs
  FROM member_revenue;

-- ------------------------------------------------- 2. reconciliation ladder
SELECT 'all rows'  AS line, count(*), sum(pl.price_dhs) FROM user_subscriptions s JOIN subscription_plans pl ON pl.id=s.plan_id
UNION ALL
SELECT 'test accounts', count(*), -sum(pl.price_dhs) FROM user_subscriptions s JOIN subscription_plans pl ON pl.id=s.plan_id
  JOIN profiles p ON p.id=s.user_id WHERE p.email IN ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com')
UNION ALL
SELECT 'staff / owner', count(*), -sum(pl.price_dhs) FROM user_subscriptions s JOIN subscription_plans pl ON pl.id=s.plan_id
  JOIN profiles p ON p.id=s.user_id WHERE p.email IN ('salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')
UNION ALL
SELECT 'duplicate contract', count(*), -sum(pl.price_dhs) FROM user_subscriptions s JOIN subscription_plans pl ON pl.id=s.plan_id
  JOIN profiles p ON p.id=s.user_id WHERE p.email = 'khadijaelhaitem@gmail.com';

-- --------------------------------------------------------- 3. month by month
WITH excluded_users AS (
  SELECT id FROM profiles WHERE email IN
    ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com',
     'salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')),
duplicate_subs AS (
  SELECT s.id FROM user_subscriptions s JOIN profiles p ON p.id=s.user_id
   WHERE p.email = 'khadijaelhaitem@gmail.com'),
m AS (
  SELECT to_char(s.start_date,'YYYY-MM') AS month, s.user_id, pl.type, pl.price_dhs
    FROM user_subscriptions s JOIN subscription_plans pl ON pl.id=s.plan_id
   WHERE s.user_id NOT IN (SELECT id FROM excluded_users)
     AND s.id NOT IN (SELECT id FROM duplicate_subs))
SELECT month,
       count(*)                                                        AS subs,
       count(DISTINCT user_id)                                         AS customers,
       sum(price_dhs) FILTER (WHERE type='abonnement')                 AS abonnement,
       sum(price_dhs) FILTER (WHERE type='carnet')                     AS carnet,
       sum(price_dhs) FILTER (WHERE type='personal_training')          AS personal_training,
       sum(price_dhs)                                                  AS revenue,
       sum(sum(price_dhs)) OVER (ORDER BY month)                       AS cumulative
  FROM m GROUP BY month ORDER BY month;

-- --------------------------------------------------------------- 4. by plan
WITH excluded_users AS (
  SELECT id FROM profiles WHERE email IN
    ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com',
     'salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')),
duplicate_subs AS (
  SELECT s.id FROM user_subscriptions s JOIN profiles p ON p.id=s.user_id
   WHERE p.email = 'khadijaelhaitem@gmail.com')
SELECT pl.name, pl.type, pl.price_dhs,
       count(s.id)                        AS sold,
       coalesce(sum(pl.price_dhs),0)      AS revenue
  FROM subscription_plans pl
  LEFT JOIN user_subscriptions s
         ON s.plan_id = pl.id
        AND s.user_id NOT IN (SELECT id FROM excluded_users)
        AND s.id      NOT IN (SELECT id FROM duplicate_subs)
 GROUP BY pl.id, pl.name, pl.type, pl.price_dhs
 ORDER BY revenue DESC;

-- ----------------------------------------------- 5. live book and expiry wall
-- October 2026 concentrates the launch cohort's renewals.
WITH excluded_users AS (
  SELECT id FROM profiles WHERE email IN
    ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com',
     'salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')),
duplicate_subs AS (
  SELECT s.id FROM user_subscriptions s JOIN profiles p ON p.id=s.user_id
   WHERE p.email = 'khadijaelhaitem@gmail.com')
SELECT to_char(s.end_date,'YYYY-MM') AS expires,
       count(*)                      AS subscriptions,
       sum(pl.price_dhs)             AS contract_value
  FROM user_subscriptions s JOIN subscription_plans pl ON pl.id = s.plan_id
 WHERE s.status = 'active'
   AND s.user_id NOT IN (SELECT id FROM excluded_users)
   AND s.id      NOT IN (SELECT id FROM duplicate_subs)
 GROUP BY 1 ORDER BY 1;

-- ---------------------------------------------------------- 6. per customer
WITH excluded_users AS (
  SELECT id FROM profiles WHERE email IN
    ('testlk@gmail.com','testsal@gmail.com','karimfitpro@gmail.com',
     'salma-sue@hotmail.com','houmer.karim@gmail.com','contact.lyazidkabbaj@gmail.com')),
duplicate_subs AS (
  SELECT s.id FROM user_subscriptions s JOIN profiles p ON p.id=s.user_id
   WHERE p.email = 'khadijaelhaitem@gmail.com')
SELECT p.full_name, p.email,
       count(*)          AS purchases,
       sum(pl.price_dhs) AS lifetime_value,
       min(s.start_date)::date AS first_purchase,
       max(s.end_date)::date   AS covered_until
  FROM user_subscriptions s
  JOIN subscription_plans pl ON pl.id = s.plan_id
  JOIN profiles p           ON p.id  = s.user_id
 WHERE s.user_id NOT IN (SELECT id FROM excluded_users)
   AND s.id      NOT IN (SELECT id FROM duplicate_subs)
 GROUP BY p.id, p.full_name, p.email
 ORDER BY lifetime_value DESC;

-- ------------------------------------------- 7. data-quality checks to watch
-- a) duplicate identities (email is the only unique key; phone is not constrained)
SELECT lower(trim(full_name)) AS name, count(*), array_agg(email) AS accounts
  FROM profiles GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;

-- b) subscriptions whose sale month and start month diverge by more than a week
SELECT p.full_name, pl.name, s.start_date::date, s.created_at::date,
       (s.created_at::date - s.start_date::date) AS day_offset
  FROM user_subscriptions s
  JOIN subscription_plans pl ON pl.id = s.plan_id
  JOIN profiles p           ON p.id  = s.user_id
 WHERE abs(s.created_at::date - s.start_date::date) > 7
 ORDER BY day_offset;

-- c) accounts that never bought anything
SELECT count(*) AS profiles_without_any_subscription
  FROM profiles p
 WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.user_id = p.id);
