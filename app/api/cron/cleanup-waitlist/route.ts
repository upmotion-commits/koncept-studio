import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// API endpoint for cron job to clean up expired waitlist entries
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

    return NextResponse.json({
      success: true,
      ...result,
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