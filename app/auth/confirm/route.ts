import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Device-independent email confirmation endpoint (token_hash flow).
//
// The legacy /auth/callback route exchanges a PKCE `?code=` which only works
// in the browser that requested the email (the code-verifier cookie lives
// there). Opening the link in the Gmail/Outlook in-app browser or on another
// device made the reset fail. verifyOtp(token_hash) has no such coupling.
//
// Requires the Supabase "Reset password" email template to link to:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = (requestUrl.searchParams.get('type') || 'recovery') as EmailOtpType

  const nextParam = requestUrl.searchParams.get('next') ?? '/reset-password'
  const nextPath = nextParam.startsWith('http')
    ? new URL(nextParam).pathname
    : nextParam

  const baseUrl = requestUrl.origin

  if (tokenHash) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      return NextResponse.redirect(`${baseUrl}${nextPath}`)
    }
    console.error('Auth Confirm Error:', error.message)
  }

  return NextResponse.redirect(`${baseUrl}/forgot-password?error=invalid_link`)
}
