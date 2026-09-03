# Phase 1 — Production Audit (read-only)

Date: 2026-08-29. Scope: verification of the 12 reported issues against the codebase and the
production database (read-only queries; no writes, no schema changes, no deployments).

## TL;DR

1. **The planning is empty since 2026-08-02.** All recurring schedules were generated on
   2026-06-28 with recurrence end `2026-08-02`; occurrences are materialized up-front and nothing
   extends them. Zero classes exist after July 29 while signups continued through August.
   If this is not an intentional closure, it is the most urgent operational problem.
2. **Capacity violations are confirmed in production**: 4 schedules over capacity, including
   CrossBike 2026-06-24 with 13 confirmed bookings for 12 bikes. Extra bookings landed minutes to
   days after the class was full — there is no effective server-side invariant. The
   `current_bookings` counter drifts (5 schedules currently wrong, both directions).
3. **Abonnement credit loss is systemic and explained**: admin class cancellation/deletion refunds
   `credits_remaining + 1` for every plan type, but abonnement bookings were charged on
   `weekly_credits_used`, which is never restored. Phantom `credits_remaining` on abonnement
   subscriptions are the fossil record (Amal 6, Nesma 4, Med Amine Amor 5; 27 users affected).
   8 of 11 logged admin weekly-credit corrections are manual −1 compensations, including Amal at
   11/10 (above her own weekly limit) on 2026-01-13.
4. **The production service-role key is committed to git** (`.env.production`), together with the
   Wasender API key. Rotation + removal required (coordinated with Vercel env vars).
5. **Password reset and "JWT expired" share one root**: reset emails are generated (Amine Amor:
   `recovery_sent_at 2026-08-24`, account healthy) but the PKCE `?code` exchange only works in the
   browser that requested the reset — cross-device/webview opens fail into
   `/forgot-password?error=invalid_link`, which the form never displays. Sessions live 9–11 months
   on refresh tokens (PWA); stale access tokens surface raw "JWT expired" PostgREST errors.

## Bug verification matrix

| # | Issue | Verified? | Root cause | Severity |
|---|-------|-----------|------------|----------|
| 1 | Password reset | Confirmed (mechanism) | PKCE code exchange is device-bound; errors invisible on the form | High |
| 2 | Cannot leave waitlist | Confirmed (code defect) | Browser-side delete+refund, all errors swallowed, success toast regardless; RLS silently blocks (policy dump pending) | High |
| 3 | Credits not restored | **Confirmed** | Wrong-field refunds on admin class deletion; non-atomic legacy cancel; unsafe waitlist-leave paths; admin promotion double-charge | **Critical** |
| 4 | Waitlist position | Already displayed | Accuracy at risk: stored positions maintained by triggers AND client loops | Medium |
| 5 | Expiration notification | Absent (confirmed) | Not implemented; only channel is WhatsApp (59% failure on some flows) | Medium |
| 6 | Redesign | Awaiting direction choice | Token-based mono design; re-skin is low-risk once approved | — |
| 7 | Capacity exceeded | **Confirmed (4 violations)** | No atomic enforcement; drifting counter trusted; admin promote/force-promote overbook | **Critical** |
| 8 | No-show system | Partially in schema | `no_show` status exists; no flagging UI/penalty logic | Planned |
| 9 | Amal has no credits | Not reproducible today | Active sub to 2027-01-08, 0/10 weekly used; historical losses = issue 3; empty August planning likely triggered the report | Explained |
| 10 | Etoo cannot join waitlist | Explained (identity to confirm) | Counter under-count makes full classes look non-full: booking refused as full, waitlist refused as "not full"; likely user: Ito ouhafsa | High |
| 11 | JWT expired | Confirmed (mechanism) | Months-old PWA sessions + browser-side DB calls; raw error strings shown | High |
| 12 | Amine Amor | Confirmed (account healthy) | Same person as "Mohammed Amine" (to confirm); failure is issue 1 + 11, not data corruption | High |

## Key production risks

- Service-role + Wasender keys committed in `.env.production` (critical — rotate).
- No credit ledger: balances are mutable counters without history.
- 59% of class-cancellation WhatsApp messages failed silently (416/707).
- Test accounts (Testsalma, Karimtest, Test lk) book real classes, consumed a CrossBike slot.
- ~30 DB functions/triggers/policies exist only in production; repo has 3 migrations; code/DB drift.
- Cancellation rules inconsistent: code 3h, settings 24h/1h, UI text 3h.
- No automated tests exist.

## Proposed plan (pending approval)

0. Access + ops: production Supabase access (function bodies, RLS, pg_cron, auth config/logs);
   decide September schedules; rotate leaked keys; handle test accounts.
1. Data integrity (issues 7, 3): one atomic SQL layer for book/cancel/join/leave/promote with row
   locks and real counts; type-aware credit movements; append-only credit ledger; counter
   recomputation; migrate all app paths; regression tests incl. concurrent booking.
2. Auth (1, 11, 12): token_hash recovery flow; visible errors; central JWT-expired
   refresh/retry/logout handling.
3. Waitlist (2, 4, 10): server-side join/leave transaction; dynamic positions; UI uses real counts.
4. Features (5, 8): idempotent expiration notification (J−7, Africa/Casablanca); no-show system
   after business rules confirmed.
5. Redesign (6): only after a direction is approved.

## Decisions recorded (2026-08-30)

1. Supabase visibility: owner runs the read-only dump scripts in `docs/audit/` and pastes results.
2. August closure was intentional; September schedules await the owner's go-ahead (studio-side action).
3. Identities confirmed: "Etoo" = Ito ouhafsa; "Mohammed Amine" = "Amine Amor" = Med Amine AMOR.
4. Cancellation deadline: standardize on the currently active rule (3 hours) everywhere, including
   the admin settings values. Notification channel for all notifications: WhatsApp.
5. Approved: rotation of the leaked Supabase service-role and Wasender keys, and removal of
   `.env.production` from the repository (done on this branch; see `docs/SECURITY_KEY_ROTATION.md`).
6. UI redesign: **Direction C — «Charbon» (Sport / Performance)** approved.

Still open: waitlist credit-at-join rule, and the no-show business rules (penalty start,
scope of the block, who can flag).

## Open questions

1. Grant Supabase access (connect project or run provided read-only SQL dump).
2. Empty August planning: intentional? Create September schedules?
3. Confirm identities: Etoo = Ito ouhafsa? Mohammed Amine = Amine Amor = Med Amine AMOR?
4. Business rules: cancellation deadline; waitlist credit-at-join; no-show details; notification
   channel/timing.
5. Approve key rotation and `.env.production` removal.
6. Choose design direction A (Atelier), B (Cadence) or C (Charbon).

## Phase 3 — implemented (2026-08-30)

See `docs/DEPLOYMENT_PHASE3.md` for the run order. Summary of changes:

- Atomic DB layer (`book_class_v2`, `cancel_booking_v2`, `join_waitlist_v2`,
  `leave_waitlist_v2`, `admin_book_class_v2`, `admin_refund_schedule_bookings`,
  `flag_no_show`, `unflag_no_show`) with schedule row-locks, real-count capacity
  checks, type-aware credit movements, an append-only `credit_ledger`, and a
  no-show penalty system (24h, window-anchored, one per booking).
- Broken `promote_from_waitlist` trigger dropped (it referenced a nonexistent
  function and silently failed on every cancellation since creation); promotion
  now happens inside `cancel_booking_v2` without double-charging.
- Cancellation deadline standardized on 3h (server-enforced, settings aligned).
- Security: admin/owner checks added to leaky SECURITY DEFINER read functions;
  legacy self-service credit RPCs revoked from `anon` immediately and from
  `authenticated` post-deploy (lockdown script).
- Auth: device-independent password-reset route (`/auth/confirm`, token_hash);
  visible error on the forgot-password form; JWT-expired auto-refresh-and-retry
  fetch wrapper for the shared browser client.
- New daily idempotent J−7 plan-expiry WhatsApp notification cron.
- Admin UI: mark/unmark no-show on past bookings; calendar modal gained a
  "Quitter la liste d'attente" action; fixed an inverted condition that
  prevented booking from the event modal; corrected the window-2 opening label
  (mercredi, not jeudi).
- Data fixes in migration: 5 drifted `current_bookings` counters recomputed;
  settings deadline values 24/1 → 3/3.
- Regression tests: `docs/audit/phase3-validation.sql` (transactional, always
  rolls back) covering booking/capacity/waitlist/refund/promotion/no-show,
  plus 4 read-only production invariants.

## Waitlist promotion notifications (2026-09-03)

Asked whether a WhatsApp goes out when someone is promoted from the waitlist.
The code existed on all three promotion paths, but production had sent **7
promotion messages in 11 months** (6 delivered, 1 refused by Wasender for a
past-due account) — and all of them arrived in bursts of 4 and 2 within
seconds of each other, i.e. an admin clicking through a list. Member-triggered
auto-promotion had produced at most one notification ever, against 765
cancellations.

Three defects, all fixed in `20260903120000_waitlist_promotion_notices.sql`
and the accompanying application change:

1. **The message named no class.** `generateWaitlistPromotionMessage(user)`
   took only the member: "your place is now confirmed", with no class, date or
   time. A member on several waitlists could not tell what they had been given.
   It now names all three (Africa/Casablanca), like the cancellation message
   always did.
2. **Delivery depended on the cancelling member's browser.** The notification
   was fired client-side after `cancel_booking_v2` returned. A closed tab, a
   dropped connection or a thrown action lost it permanently while the
   promotion stood. The promotion now writes a row in
   `waitlist_promotion_notices` in the same transaction that grants the place,
   and a service-role worker delivers it, with bounded retries. The daily
   `cleanup-waitlist` cron re-runs the worker for anything still queued; no
   new cron job was added, because the Hobby plan caps both their number and
   their frequency.
3. **The send ran with the wrong identity.** The old server action read the
   *promoted* member's profile using the *cancelling* member's session — the
   only cross-user profile read in the whole codebase; every other one is
   `.eq('id', user.id)`. If `profiles` SELECT is self-only it returned nothing
   and the send was skipped silently, which fits the 7 messages exactly. The
   worker uses the service role, so the outcome no longer depends on that
   policy either way.

Also fixed while in the area: the J−7 expiry cron logged its WhatsApp sends
with a caller-scoped client, but a cron has no session, so those log writes
were made as `anon` and would have been dropped by RLS. It now logs with the
service role.
