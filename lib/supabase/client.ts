import { createBrowserClient } from '@supabase/ssr'
import { APP_CONFIG } from '@/constants/config'

type BrowserClient = ReturnType<typeof createBrowserClient>

// Single shared browser client. Long-lived PWA sessions regularly fire
// requests with an access token that expired while the app was in the
// background, which surfaces raw "JWT expired" database errors. The fetch
// wrapper below refreshes the session and retries once when that happens.

let browserClient: BrowserClient | null = null
let refreshingPromise: Promise<void> | null = null

async function refreshSessionOnce(): Promise<void> {
  if (!browserClient) return
  if (!refreshingPromise) {
    refreshingPromise = browserClient.auth
      .refreshSession()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        refreshingPromise = null
      })
  }
  return refreshingPromise
}

function isJwtExpiredResponse(status: number, bodyText: string): boolean {
  if (status !== 401) return false
  return bodyText.includes('JWT expired') || bodyText.includes('PGRST301')
}

const fetchWithJwtRetry: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)

  if (response.status === 401 && browserClient) {
    let bodyText = ''
    try {
      bodyText = await response.clone().text()
    } catch {
      return response
    }

    if (isJwtExpiredResponse(response.status, bodyText)) {
      await refreshSessionOnce()

      // Re-read the (possibly renewed) token for the retry
      const { data } = await browserClient.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        const headers = new Headers(init?.headers)
        if (headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }
        return fetch(input, { ...init, headers })
      }
    }
  }

  return response
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    // During build time, environment variables might not be available
    // Return a dummy client that will fail gracefully
    if (typeof window === 'undefined') {
      console.warn('Supabase environment variables not available during build')
      return createBrowserClient(APP_CONFIG.SUPABASE.PLACEHOLDER_URL, APP_CONFIG.SUPABASE.PLACEHOLDER_KEY)
    }
    throw new Error('Missing Supabase environment variables')
  }

  // Server-side rendering path keeps the plain client (no retry state)
  if (typeof window === 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseKey)
  }

  const client =
    browserClient ??
    createBrowserClient(supabaseUrl, supabaseKey, {
      global: { fetch: fetchWithJwtRetry },
    })
  browserClient = client
  return client
}
