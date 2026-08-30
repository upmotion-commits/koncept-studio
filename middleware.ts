import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  const { supabaseResponse, user } = await updateSession(request)
  
  if (pathname === '/reset-password' || pathname === '/auth/callback' || pathname === '/auth/confirm') {
    return supabaseResponse
  }
  
  const url = request.nextUrl.clone()

  // Protected routes that require authentication
  if (url.pathname.startsWith('/espace')) {
    if (!user) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Admin routes that require admin role
  if (url.pathname.startsWith('/admin')) {
    if (!user) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Note: Admin role check will be done in the admin page component
    // since middleware has limitations with database queries
  }

  // Redirect authenticated users away from auth pages
  if (user && (url.pathname === '/login' || url.pathname === '/signup')) {
    // Redirect to espace, which will then redirect admins to /admin automatically
    url.pathname = '/espace'
    return NextResponse.redirect(url)
  }

  // Add pathname to headers for conditional navbar
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  // If supabaseResponse is already a response (redirect, etc), return it
  if (supabaseResponse.status !== 200) {
    return supabaseResponse
  }

  // Otherwise, create a new response with our headers
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}