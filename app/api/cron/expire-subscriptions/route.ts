import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// API endpoint for cron job to expire subscriptions automatically
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

    // Call the subscription expiration function
    const { data: result, error } = await supabase
      .rpc('expire_subscriptions')

    if (error) {
      console.error('❌ Subscription expiration error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    console.log('✅ Subscription expiration completed:', result)

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Subscription expiration failed:', error)
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