-- ============================================================================
-- PHASE 3 — LOCKDOWN (run AFTER the new application code is deployed and
-- verified: booking, cancelling, joining/leaving a waitlist all work)
--
-- Removes client access to the legacy credit RPCs. Until this runs, any
-- authenticated user can still call refund_booking_credits repeatedly to grant
-- themselves credits — so run it promptly after the deploy is verified.
--
-- Rollback: re-GRANT the same statements with GRANT instead of REVOKE.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.update_booking_credits(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_booking_credits(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_subscription_credits(uuid, integer, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_refund(uuid, uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.book_class(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid) FROM authenticated;

-- Cron functions: after this deploy the cron routes use the service role
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_waitlists() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_weekly_credits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_expired_subscriptions() FROM authenticated;

COMMIT;
