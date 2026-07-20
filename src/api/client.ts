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

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  credentials: 'include',
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
