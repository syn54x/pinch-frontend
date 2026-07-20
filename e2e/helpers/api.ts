import { type APIRequestContext, request } from '@playwright/test'

// Backend-side seeding, straight through the real API. The backend's CSRF is
// a double-submit cookie: a safe request issues the cookie, unsafe requests
// echo it in x-csrftoken.

const API = 'http://localhost:8100'

/** One suite-wide password: what it is never matters, only that it works. */
export const PASSWORD = 'correct-horse-battery'

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
  /** Signed integer minor units (the backend's I-1 discipline). */
  balanceMinor?: number
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
    for (const { balanceMinor, ...account } of accounts) {
      const created = await ctx.post('/api/v1/accounts', {
        data: account,
        headers: await csrfHeader(ctx),
      })
      if (!created.ok()) {
        throw new Error(
          `seed account failed: ${created.status()} ${await created.text()}`,
        )
      }
      if (balanceMinor !== undefined) {
        const { id } = (await created.json()) as { id: string }
        const balance = await ctx.post(
          `/api/v1/accounts/${id}/balance-entries`,
          {
            data: { amount_minor: balanceMinor },
            headers: await csrfHeader(ctx),
          },
        )
        if (!balance.ok()) {
          throw new Error(
            `seed balance failed: ${balance.status()} ${await balance.text()}`,
          )
        }
      }
    }
  } finally {
    await ctx.dispose()
  }
}

/** Revoke every session of the user except the API context's own — the way a
 * browser session dies out from under a still-open tab. */
export async function revokeOtherSessions(
  email: string,
  password: string,
): Promise<void> {
  const ctx = await request.newContext({ baseURL: API })
  try {
    await ctx.get('/health')
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email, password },
      headers: await csrfHeader(ctx),
    })
    if (!login.ok()) throw new Error(`revoke login failed: ${login.status()}`)

    const sessions = await ctx.get('/api/v1/auth/sessions')
    const { items } = (await sessions.json()) as {
      items: Array<{ id: string; current: boolean }>
    }
    for (const session of items.filter((s) => !s.current)) {
      const revoked = await ctx.delete(`/api/v1/auth/sessions/${session.id}`, {
        headers: await csrfHeader(ctx),
      })
      if (!revoked.ok()) throw new Error(`revoke failed: ${revoked.status()}`)
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
