import { createAdminClient } from '@/lib/supabase/admin'
import { whatsappAdminService } from '@/lib/services/server'
import { generateWaitlistPromotionMessage } from '@/lib/utils/whatsapp-messages'

/**
 * Delivers the pending waitlist-promotion notices.
 *
 * `cancel_booking_v2` and `enqueue_waitlist_promotion_notice` write a notice in
 * the same transaction that grants the place, so a promotion can never happen
 * without a notice existing. This is the only sender: it runs with the service
 * role, so it does not depend on whoever's session triggered the promotion
 * being allowed to read the promoted member's profile.
 *
 * Claiming is a guarded UPDATE (`claimed_at IS NULL`), so two workers running
 * at once — the post-cancellation nudge and the cron — cannot both send the
 * same notice. A claim older than STALE_CLAIM_MINUTES is retried, because a
 * worker that died mid-send leaves its claim behind.
 */

const MAX_ATTEMPTS = 3
const STALE_CLAIM_MINUTES = 10
const DEFAULT_BATCH = 25

export interface DeliveryReport {
  claimed: number
  sent: number
  skipped: number
  failed: number
}

interface NoticeRow {
  id: string
  user_id: string
  schedule_id: string
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null
  class_schedules: { start_datetime: string | null; classes: { title: string | null } | null } | null
}

export async function deliverPendingWaitlistPromotions(
  limit: number = DEFAULT_BATCH
): Promise<DeliveryReport> {
  const report: DeliveryReport = { claimed: 0, sent: 0, skipped: 0, failed: 0 }
  const supabase = createAdminClient()

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()

  const { data: candidates, error: findError } = await supabase
    .from('waitlist_promotion_notices')
    .select('id, claimed_at')
    .is('notified_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order('promoted_at', { ascending: true })
    .limit(limit)

  if (findError) {
    console.error('waitlist promotions: could not list pending notices', findError)
    throw new Error(findError.message)
  }
  if (!candidates?.length) return report

  for (const candidate of candidates) {
    // Guarded claim. Re-asserting the claim state the candidate was read with
    // is what makes this atomic: only one worker's UPDATE matches.
    const claim = supabase
      .from('waitlist_promotion_notices')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .is('notified_at', null)

    const { data: claimed, error: claimError } = await (candidate.claimed_at === null
      ? claim.is('claimed_at', null)
      : claim.lt('claimed_at', staleBefore)
    ).select(`
        id,
        user_id,
        schedule_id,
        profiles ( full_name, email, phone ),
        class_schedules ( start_datetime, classes ( title ) )
      `)

    if (claimError) {
      console.error(`waitlist promotions: claim failed for ${candidate.id}`, claimError)
      report.failed++
      continue
    }
    if (!claimed?.length) continue // another worker took it

    const notice = claimed[0] as unknown as NoticeRow
    report.claimed++

    const profile = notice.profiles
    if (!profile?.phone) {
      // Nothing to send to. Close the notice rather than retrying forever;
      // the row stays as the record that the member was promoted.
      await markNotified(supabase, notice.id, 'no_phone_number')
      report.skipped++
      continue
    }

    try {
      const result = await whatsappAdminService.sendMessage({
        phoneNumber: profile.phone,
        message: generateWaitlistPromotionMessage(
          { full_name: profile.full_name, email: profile.email ?? '', phone: profile.phone },
          notice.class_schedules?.classes?.title ?? null,
          notice.class_schedules?.start_datetime ?? null
        ),
        eventType: 'waitlist_promotion',
        userId: notice.user_id,
      })

      if (result.success) {
        await markNotified(supabase, notice.id, null)
        report.sent++
      } else {
        await releaseForRetry(supabase, notice.id, result.error ?? 'unknown error')
        report.failed++
      }
    } catch (error) {
      await releaseForRetry(
        supabase,
        notice.id,
        error instanceof Error ? error.message : 'unknown error'
      )
      report.failed++
    }
  }

  return report
}

async function markNotified(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  note: string | null
) {
  const { error } = await supabase
    .from('waitlist_promotion_notices')
    .update({ notified_at: new Date().toISOString(), last_error: note })
    .eq('id', id)
  if (error) console.error(`waitlist promotions: could not close notice ${id}`, error)
}

/**
 * Release the claim and count the attempt, so the cron picks it up again.
 * After MAX_ATTEMPTS the notice stops being retried and stays visible in the
 * admin queue with its last error.
 */
async function releaseForRetry(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  message: string
) {
  const { data: current } = await supabase
    .from('waitlist_promotion_notices')
    .select('attempts')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('waitlist_promotion_notices')
    .update({
      claimed_at: null,
      attempts: (current?.attempts ?? 0) + 1,
      last_error: message,
    })
    .eq('id', id)
  if (error) console.error(`waitlist promotions: could not release notice ${id}`, error)
}
