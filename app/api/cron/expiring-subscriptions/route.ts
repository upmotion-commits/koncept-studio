import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { whatsappAdminService } from '@/lib/services/server'
import { generateSubscriptionExpiryMessage } from '@/lib/utils/whatsapp-messages'

const NOTIFICATION_TYPE = 'expiry_7d'

// Daily cron: notify users (WhatsApp) about one week before their plan expires.
// Idempotent: each (subscription, type) is claimed in notification_log with a
// unique constraint before sending, so re-runs and double-fires never notify
// the same subscription twice. Already-expired plans are excluded by the query.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const now = new Date()
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: expiring, error } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        user_id,
        end_date,
        subscription_plans ( name, type ),
        profiles ( id, full_name, email, phone )
      `)
      .eq('status', 'active')
      .gt('end_date', now.toISOString())
      .lte('end_date', inSevenDays.toISOString())

    if (error) {
      console.error('❌ Expiring subscriptions query failed:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const sub of expiring || []) {
      // Claim the notification first — the UNIQUE(subscription_id, type)
      // constraint makes this the idempotency gate.
      const { error: claimError } = await supabase
        .from('notification_log')
        .insert({ user_id: sub.user_id, subscription_id: sub.id, type: NOTIFICATION_TYPE })

      if (claimError) {
        // 23505 = already claimed by a previous run
        if (claimError.code === '23505') {
          skipped++
          continue
        }
        console.error(`❌ Could not claim notification for subscription ${sub.id}:`, claimError)
        failed++
        continue
      }

      const profile = sub.profiles as any
      const plan = sub.subscription_plans as any

      if (!profile?.phone) {
        console.log(`No phone for user ${sub.user_id}, expiry notification logged but not sent`)
        skipped++
        continue
      }

      try {
        const message = generateSubscriptionExpiryMessage(profile, plan?.name || 'Votre abonnement', sub.end_date)
        await whatsappAdminService.sendMessage({
          phoneNumber: profile.phone,
          message,
          eventType: 'subscription_expiring',
          userId: sub.user_id
        })
        sent++
      } catch (sendError) {
        console.error(`❌ WhatsApp expiry notification failed for user ${sub.user_id}:`, sendError)
        // The claim stays in place: the send failure is visible in
        // whatsapp_logs (status=failed) for the admin to follow up, and the
        // user is not spammed on the next runs. The log is written with the
        // service role — a cron has no session, so the caller-scoped client
        // would have been blocked by RLS and the failure left no trace.
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      candidates: expiring?.length || 0,
      sent,
      skipped,
      failed,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Expiring subscriptions cron failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
