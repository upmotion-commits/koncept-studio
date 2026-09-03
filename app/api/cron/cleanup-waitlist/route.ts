import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import {
  deliverPendingWaitlistPromotions,
  type DeliveryReport,
} from '@/lib/services/waitlist-promotion-notifier'

// Daily waitlist maintenance: drop expired entries, then flush any promotion
// notice that never went out.
//
// The flush lives here rather than in its own cron because this account's
// Vercel plan caps both how many cron jobs a project may have and how often
// they may run. /api/cron/waitlist-promotions still exists and can be called
// by hand or scheduled separately on a plan that allows it — this is only the
// guaranteed daily sweep. The common case never reaches either: the member who
// cancels delivers the notice within the same second.
export async function POST(request: NextRequest) {
  try {
    // Authenticate cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cron requests carry no user cookies: use the service role so the
    // RPCs keep working once client roles lose EXECUTE on them (lockdown).
    const supabase = createAdminClient()

    // Call the cleanup function
    const { data: result, error } = await supabase
      .rpc('cleanup_expired_waitlists')

    if (error) {
      console.error('❌ Cron cleanup error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    console.log('✅ Cron cleanup completed:', result)

    // Never let a delivery problem fail the cleanup cron: the notices stay
    // queued and the next run retries them.
    let promotions: DeliveryReport | null = null
    try {
      promotions = await deliverPendingWaitlistPromotions(100)
      if (promotions.claimed > 0) {
        console.log('✅ Waitlist promotion notices delivered:', promotions)
      }
    } catch (notifyError) {
      console.error('❌ Waitlist promotion flush failed:', notifyError)
    }

    return NextResponse.json({
      success: true,
      ...result,
      promotions,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Cron cleanup failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// Allow GET for testing/manual trigger
export async function GET(request: NextRequest) {
  return POST(request)
}