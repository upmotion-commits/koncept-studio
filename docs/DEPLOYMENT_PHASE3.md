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

## 2. Validate

Run `docs/audit/phase3-validation.sql` in the SQL Editor. Expect
`✅ ALL PHASE 3 TESTS PASSED` (the test transaction always rolls back).
Then run its Section B invariants — all three queries must return zero rows.

## 3. Merge & deploy the application

Merge this branch. Verify on production:
- log in, book a class, cancel it (check the credit comes back),
- join + leave a waitlist (check the credit),
- admin: book for a user, mark a past booking "absent", remove the flag.

## 4. Run the lockdown migration (after the deploy is verified)

Supabase SQL Editor → run `supabase/migrations/20260830110000_phase3_lockdown.sql`.

This revokes client access to the legacy credit RPCs (including the one any
user could call in a loop to self-grant credits). Do not skip or delay it.

## 5. Rollback plan

- Application: revert the merge commit in Vercel (instant rollback to the
  previous deployment).
- Database: run `supabase/migrations/20260830100000_phase3_core.rollback.sql`
  (restores all replaced functions/triggers/grants; drops the new tables).
  If lockdown was already applied, re-grant with the GRANT equivalents listed
  in the lockdown file's header first.
- The 5 counter corrections and the two settings values are corrections of
  wrong data and are intentionally not reverted.

## Notes

- The cron routes now use the service role; `CRON_SECRET` continues to guard
  them. A new daily cron `/api/cron/expiring-subscriptions` (08:00 UTC) sends
  the J−7 WhatsApp expiry notice, idempotent via `notification_log`.
- The no-show penalty rule implemented: any admin can flag a confirmed booking
  once the class has started; the member is blocked from booking and joining
  waitlists for 24h — starting immediately if the current booking window's
  opening rush (first 24h after Sun/Wed 17:00 Casablanca) is still running,
  otherwise starting at the next window opening. Flags are reversible
  ("Retirer l'absence") and one penalty per booking is enforced by the schema.
- `forcePromoteFromWaitlist` (admin) is now stopped by the capacity trigger
  when the class is genuinely full — it can no longer overbook. Say the word
  if you want a true override; it would need an explicit trigger bypass.
