# Phase 3 deployment runbook

Follow this order exactly. Each step is safe on its own; the order prevents any
window where the live app calls a function that no longer accepts it.

## 0. Preconditions

- Vercel env vars verified per `docs/SECURITY_KEY_ROTATION.md` step 0
  (the branch also removes `.env.production`, so this is mandatory).
- Supabase Auth → Emails → Templates → **Reset password**: replace the link in
  the template with:

  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
  ```

  This makes password-reset links work from any device/mail app. The legacy
  `/auth/callback` route keeps working during the transition, so this can be
  done before or right after the deploy — but it is required for the
  password-reset fix (Issues 1/12) to be effective.

## 1. Run the core migration (before merging)

Supabase SQL Editor → run `supabase/migrations/20260830100000_phase3_core.sql`.

It adds the credit ledger, no-show penalties, notification log, the v2
booking/waitlist functions, drops the broken promotion trigger, hardens leaky
read functions, recomputes 5 drifted `current_bookings` rows, and sets the
settings deadline values to 3h. The currently deployed app keeps working —
nothing it calls is removed at this step.

## 1b. Run the waitlist-notice migration

Supabase SQL Editor → run
`supabase/migrations/20260903120000_waitlist_promotion_notices.sql`.

It adds the `waitlist_promotion_notices` outbox, the admin-only
`enqueue_waitlist_promotion_notice` helper, and replaces `cancel_booking_v2`
with the same logic plus one INSERT that records the promotion. The currently
deployed app keeps working: it reads `promoted_user_id`, which the new version
still returns.

It ends with `NOTICE ✅ waitlist promotion notices installed`. It is
idempotent — re-running it changes nothing.

**This step must happen before the merge in step 3, not after.** The deployed
app queues promotion notices instead of sending WhatsApp inline; if it goes
live against a database without the outbox, promotions still work but nobody
is notified. Running the migration first is safe in either order for the
*currently* deployed app, so there is no window to thread.

## 2. Validate

Run `docs/audit/phase3-validation.sql` in the SQL Editor. Expect
`✅ ALL PHASE 3 TESTS PASSED` (the test transaction always rolls back).
Then run its Section B invariants — all four queries must return zero rows.

B4 is the new one: it lists members who won a place from the waitlist and were
never told. It must stay empty once the cron below is running.

## 3. Merge & deploy the application

Merge this branch. Verify on production:
- log in, book a class, cancel it (check the credit comes back),
- join + leave a waitlist (check the credit),
- admin: book for a user, mark a past booking "absent", remove the flag,
- fill a class, have a second member join the waitlist, then cancel the first
  member's booking: the second member must be promoted **and** receive a
  WhatsApp naming the class, its date and its time. Check
  `select * from waitlist_promotion_notices order by promoted_at desc limit 5;`
  — the row must have a `notified_at`.

**Then run invariant B4 from `docs/audit/phase3-validation.sql` a day later.**
It lists promotions whose notice never went out. Zero rows means the queue is
draining. This is the check that catches a worker which queues correctly but
cannot deliver — exactly what happened between 5 and 11 September 2026, when
the claim query was rejected by PostgREST and 19 promotions were recorded
without a single message being sent.

**No new cron job is added.** The Hobby plan caps both the number of cron
jobs and how often they run, so the daily sweep for undelivered promotion
notices is folded into the existing `/api/cron/cleanup-waitlist` (17:59) —
`vercel.json` is unchanged from what already deploys. The dedicated route
`/api/cron/waitlist-promotions` still exists for a manual trigger:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/waitlist-promotions
```

On a Pro plan, schedule that path every 15 minutes and the sweep becomes
near-real-time. Either way the common case never reaches a cron: the member
who cancels delivers the notice in the same second. The sweep only covers a
closed tab, a dropped connection, or a Wasender outage — worst case, the
notice waits until the next daily run.

## 4. Run the lockdown migration (after the deploy is verified)

Supabase SQL Editor → run `supabase/migrations/20260830110000_phase3_lockdown.sql`.

This revokes client access to the legacy credit RPCs (including the one any
user could call in a loop to self-grant credits). Do not skip or delay it.

## 5. Rollback plan

- Application: revert the merge commit in Vercel (instant rollback to the
  previous deployment).
- Database: run
  `supabase/migrations/20260903120000_waitlist_promotion_notices.rollback.sql`
  first (check for undelivered notices before it drops the table — the file
  says how), then
  `supabase/migrations/20260830100000_phase3_core.rollback.sql`
  (restores all replaced functions/triggers/grants; drops the new tables).
  If lockdown was already applied, re-grant with the GRANT equivalents listed
  in the lockdown file's header first.
- The 5 counter corrections and the two settings values are corrections of
  wrong data and are intentionally not reverted.

## Notes

- The cron routes now use the service role; `CRON_SECRET` continues to guard
  them. A new daily cron `/api/cron/expiring-subscriptions` (08:00 UTC) sends
  the J−7 WhatsApp expiry notice, idempotent via `notification_log`.
- Waitlist promotions are now announced from one place. The promotion writes a
  row in `waitlist_promotion_notices` inside the same transaction that grants
  the place, and a service-role worker sends the WhatsApp — so the message no
  longer depends on the cancelling member's browser staying open, or on that
  member being allowed to read the promoted member's profile. The daily
  `cleanup-waitlist` cron re-runs the worker for anything left queued. The message names
  the class, its date and its time; before, it said only "your place is
  confirmed", which a member on several waitlists could not act on.
  Undelivered notices are visible to admins in the table, with `attempts` and
  `last_error`.
- The no-show penalty rule implemented: any admin can flag a confirmed booking
  once the class has started; the member is blocked from booking and joining
  waitlists for 24h — starting immediately if the current booking window's
  opening rush (first 24h after Sun/Wed 17:00 Casablanca) is still running,
  otherwise starting at the next window opening. Flags are reversible
  ("Retirer l'absence") and one penalty per booking is enforced by the schema.
- `forcePromoteFromWaitlist` (admin) is now stopped by the capacity trigger
  when the class is genuinely full — it can no longer overbook. Say the word
  if you want a true override; it would need an explicit trigger bypass.

## Studio clock — Morocco is permanently UTC+0 (2026-09-22)

Morocco has settled on UTC+0 with no seasonal or Ramadan change. The studio's
wall clock and UTC are now the same clock, permanently.

**Nothing in the app resolves a timezone name any more.** `Africa/Casablanca`
is looked up in whatever copy of the IANA database a runtime carries, and those
copies disagree for weeks after a rule change — which is how one class came to
show 17:30 on one phone and 18:30 on another. `lib/utils/studio-time.ts` now
shifts the instant by a stated constant (`STUDIO_UTC_OFFSET_MINUTES = 0`) and
formats in UTC, which every runtime renders identically. There is no
environment variable: nothing to forget, mis-scope, or leave stale after a
deploy. `NEXT_PUBLIC_STUDIO_TZ_OFFSET_OVERRIDE` and `NEXT_PUBLIC_STUDIO_UTC_OFFSET`
are no longer read and should be deleted from Vercel.

It works in both directions. Reads go through `formatStudio*`; writes go
through `studioWallClockToISO`, so the schedule form stores the same instant
for "17:30" whichever machine the admin types it on. That was the original
defect: the September timetable was generated on a laptop at UTC+1 and every
class landed an hour off when the country moved.

`supabase/migrations/20260922010000_studio_time_is_utc.sql` does the same on
the database side — the booking-window helpers and the no-show penalty
messages move off the zone name, and the Sunday weekly-credit reset moves from
16:00 to 17:00 UTC, which is 17:00 at the studio. Run it once; it is idempotent
and has a rollback.

The daily crons were pinned to UTC hours chosen when the studio was UTC+1, so
they all slid an hour earlier in local terms. Two are restored to their
intended local time; expiry stays at midnight, which is now midnight locally:

| Job | Was | Now | Studio time |
|---|---|---|---|
| cleanup-waitlist | `59 17 * * *` | `59 18 * * *` | 18:59, clear of the 17:00 booking rush |
| expire-subscriptions | `0 0 * * *` | unchanged | midnight |
| expiring-subscriptions (J-7) | `0 8 * * *` | `0 9 * * *` | 09:00, not 08:00 |

**If the decision is ever reversed**, change `STUDIO_UTC_OFFSET_MINUTES` to 60,
run the SQL rollback, and move the cron hours back. Those are the only places
the offset lives.
