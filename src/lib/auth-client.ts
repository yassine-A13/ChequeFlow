import { createInternalNeonAuth } from '@neondatabase/auth'
import { BetterAuthReactAdapter, type BetterAuthReactAdapterInstance } from '@neondatabase/auth/react/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

export const neonAuthConfigured = Boolean(authUrl)
// Never point the SDK at this Vite app: Vite does not serve functions from api/.
// The placeholder is only used to let the app render when the public URL is unset;
// auth actions and protected routes are disabled in that case.
const clientUrl = authUrl || 'http://127.0.0.1:1/neon-auth-not-configured'

declare global {
  interface Window { __neonAuthFetchDiagnosticsInstalled?: boolean }
}

// Keep the React API and JWT retrieval on the same underlying Neon client.
const neonAuth = createInternalNeonAuth<BetterAuthReactAdapterInstance>(clientUrl, { adapter: BetterAuthReactAdapter() })
export const authClient = neonAuth.adapter
export const getNeonAuthToken = () => neonAuth.getJWTToken()

// Keep diagnostics scoped to Neon Auth and app API requests. Local API calls
// carry a bearer token minted by Neon Auth; the server verifies it with Neon JWKS.
if (typeof window !== 'undefined' && !window.__neonAuthFetchDiagnosticsInstalled) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
    const isNeonAuthRequest = Boolean(authUrl && requestUrl.href.startsWith(authUrl))
    const isApiRequest = requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/')
    const isTrackedRequest = isNeonAuthRequest || isApiRequest
    if (isTrackedRequest) console.info(isNeonAuthRequest ? '[Neon Auth] Request:' : '[API] Request:', requestUrl.href)
    try {
      let requestInit = init
      if (isApiRequest) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
        if (!headers.has('authorization')) {
          const token = await getNeonAuthToken()
          if (token) headers.set('authorization', `Bearer ${token}`)
        }
        requestInit = { ...init, headers }
      }
      const response = await originalFetch(input, requestInit)
      if (isTrackedRequest) {
        const contentType = response.headers.get('content-type') ?? '(absent)'
        const label = isNeonAuthRequest ? '[Neon Auth]' : '[API]'
        console.info(`${label} Response:`, { url: response.url || requestUrl.href, status: response.status, contentType })
        void response.clone().text().then(body => {
          if (!contentType.toLowerCase().includes('json')) {
            console.error(`${label} Réponse non JSON:`, body.slice(0, 240))
          }
        }).catch(() => {})
      }
      return response
    } catch (error) {
      if (isTrackedRequest) console.error(isNeonAuthRequest ? '[Neon Auth] Network error:' : '[API] Network error:', requestUrl.href, error)
      throw error
    }
  }
  window.__neonAuthFetchDiagnosticsInstalled = true
}

export function getAuthClient() {
  return authClient
}
