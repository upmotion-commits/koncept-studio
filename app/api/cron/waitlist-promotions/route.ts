import { NextRequest, NextResponse } from 'next/server'
import { deliverPendingWaitlistPromotions } from '@/lib/services/waitlist-promotion-notifier'

// Backstop for waitlist-promotion notifications.
//
// The normal path is instant: the member who cancels triggers the same
// delivery through a server action as soon as the cancellation returns. This
// cron exists for the cases that path cannot cover — a closed tab, a dropped
// connection, a Wasender outage — because the notice is committed with the
// promoted booking and must eventually go out.
//
// Safe to run as often as the plan allows: notices are claimed atomically and
// closed once sent, so a run with nothing pending sends nothing.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await deliverPendingWaitlistPromotions(100)

    if (report.claimed > 0) {
      console.log('Waitlist promotion notices delivered:', report)
    }

    return NextResponse.json({ success: true, ...report })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Waitlist promotion cron failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
