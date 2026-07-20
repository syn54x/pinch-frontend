import { client } from './generated/client.gen'

// Runtime configuration for the generated client. Importing this module
// (once, in main.tsx) configures every generated query/mutation.
//
// The session cookie is the sole credential (no tokens in JS-visible
// storage), so every request carries credentials. The backend's CSRF is
// Litestar's double-submit cookie: echo the `csrftoken` cookie in the
// `x-csrftoken` header on unsafe methods — handled here so no component
// ever thinks about it.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function csrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

/** True when a response is the backend rejecting our CSRF token. */
async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { detail?: unknown } | null
  return typeof body?.detail === 'string' && body.detail.includes('CSRF')
}

// The double-submit cookie can go stale out from under the browser — the
// dev backend signs with an ephemeral per-process key, so every restart
// invalidates in-flight tokens (and a hosted secret rotation would too).
// A rejected token is recoverable by construction: drop the cookie, let a
// safe request issue a fresh one, and retry the original request once.
async function fetchWithCsrfRecovery(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init)
  const retry = request.clone()
  const response = await fetch(request)
  if (await isCsrfRejection(response)) {
    document.cookie = 'csrftoken=; Max-Age=0; path=/'
    await fetch(new URL('/health', request.url), { credentials: 'include' })
    const token = csrfToken()
    if (token) {
      retry.headers.set('x-csrftoken', token)
      return fetch(retry)
    }
  }
  return response
}

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  credentials: 'include',
  fetch: fetchWithCsrfRecovery,
})

/** The HTTP status of an error thrown by the generated client, if any. */
export function statusOf(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status_code' in error &&
    typeof (error as { status_code: unknown }).status_code === 'number'
  ) {
    return (error as { status_code: number }).status_code
  }
  return undefined
}

/** True when an error thrown by the generated client is the backend's 401. */
export function isUnauthorized(error: unknown): boolean {
  return statusOf(error) === 401
}

/** The backend's structured error detail, for inline display in forms. */
export function errorDetail(error: unknown): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    return String((error as { detail: unknown }).detail)
  }
  return 'Something went wrong — please try again.'
}

// Auth endpoints whose 401s mean something other than "the session died":
// login's is "wrong credentials" (rendered inline by the form) and me's is
// the route guard's probe (redirected via the router, no full page load).
const SELF_HANDLED_401S = ['/api/v1/auth/login', '/api/v1/auth/me']

// Session expiry, handled once: any other 401 means the cookie went stale
// out from under the app — send the user to login, keeping their place.
client.interceptors.response.use((response, request) => {
  if (
    response.status === 401 &&
    !SELF_HANDLED_401S.includes(new URL(request.url).pathname)
  ) {
    const { pathname, search } = window.location
    if (pathname !== '/login') {
      const redirect = encodeURIComponent(pathname + search)
      window.location.assign(`/login?redirect=${redirect}`)
    }
  }
  return response
})

client.interceptors.request.use(async (request) => {
  if (UNSAFE_METHODS.has(request.method)) {
    // Pre-session bootstrap: the double-submit cookie is issued on any safe
    // response, so a first-ever unsafe request (login on a cold visit) fetches
    // one via /health before proceeding.
    if (!csrfToken()) {
      const base = new URL(request.url).origin
      await fetch(`${base}/health`, { credentials: 'include' })
    }
    const token = csrfToken()
    if (token) request.headers.set('x-csrftoken', token)
  }
  return request
})
