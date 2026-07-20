import { type APIRequestContext, request } from '@playwright/test'

// Backend-side seeding, straight through the real API. The backend's CSRF is
// a double-submit cookie: a safe request issues the cookie, unsafe requests
// echo it in x-csrftoken.

const API = 'http://localhost:8100'

async function csrfHeader(
  ctx: APIRequestContext,
): Promise<Record<string, string>> {
  const state = await ctx.storageState()
  const token = state.cookies.find((c) => c.name === 'csrftoken')?.value
  if (!token)
    throw new Error('no csrftoken cookie in API context — GET something first')
  return { 'x-csrftoken': token }
}

export interface SeedAccount {
  kind: 'depository' | 'credit' | 'investment' | 'loan' | 'asset'
  label: string
  currency: string
}

/** Create a user (and optionally accounts) via the API. Returns nothing —
 * the caller logs in through the UI; that's the behavior under test. */
export async function seedUser(
  email: string,
  password: string,
  accounts: SeedAccount[] = [],
): Promise<void> {
  const ctx = await request.newContext({ baseURL: API })
  try {
    // Safe request first: obtains the CSRF cookie.
    const health = await ctx.get('/health')
    if (!health.ok())
      throw new Error(`backend health check failed: ${health.status()}`)

    const signup = await ctx.post('/api/v1/auth/signup', {
      data: { email, password },
      headers: await csrfHeader(ctx),
    })
    if (!signup.ok()) {
      throw new Error(
        `seed signup failed: ${signup.status()} ${await signup.text()}`,
      )
    }

    // Signup lands the context authenticated (session cookie set) — create
    // accounts as that user.
    for (const account of accounts) {
      const created = await ctx.post('/api/v1/accounts', {
        data: account,
        headers: await csrfHeader(ctx),
      })
      if (!created.ok()) {
        throw new Error(
          `seed account failed: ${created.status()} ${await created.text()}`,
        )
      }
    }
  } finally {
    await ctx.dispose()
  }
}

let counter = 0

/** Unique-per-run email so tests never collide on the shared database. */
export function uniqueEmail(tag: string): string {
  counter += 1
  // Real-TLD fake domain: the backend's email validation rejects reserved
  // special-use TLDs (.test, .example) but does no deliverability lookup.
  return `${tag}-${Date.now()}-${counter}@e2e.pinchapp.dev`
}
