import { request } from '@playwright/test'
import { authedContext } from './api'
import { backendDotenv, dotenvValue } from './env'

// Plaid sandbox helpers: mint public tokens without the Link widget (the
// backend's own tests use the same shortcut) and seed real sandbox
// connections through the real backend exchange.

const PLAID_SANDBOX = 'https://sandbox.plaid.com'

// First Platypus Bank — Plaid's canonical sandbox institution.
const SANDBOX_INSTITUTION = 'ins_109508'

let cachedCreds: { clientId: string; secret: string } | null = null

/** Sandbox credentials: the backend's .env.local locally, process env in
 * CI — file first so an ambient shell's production exports can't hijack
 * seeding (see helpers/env.ts). All-or-nothing per source — never a mixed
 * pair. */
async function plaidCreds(): Promise<{ clientId: string; secret: string }> {
  if (cachedCreds) return cachedCreds
  const dotenv = await backendDotenv()
  const fileClientId = dotenvValue(dotenv, 'PINCH_PLAID_CLIENT_ID')
  const fileSecret = dotenvValue(dotenv, 'PINCH_PLAID_SECRET')
  if (fileClientId && fileSecret) {
    cachedCreds = { clientId: fileClientId, secret: fileSecret }
    return cachedCreds
  }
  const envClientId = process.env.PINCH_PLAID_CLIENT_ID
  const envSecret = process.env.PINCH_PLAID_SECRET
  if (!envClientId || !envSecret) {
    throw new Error(
      'Plaid sandbox credentials not found (backend .env.local or process env)',
    )
  }
  cachedCreds = { clientId: envClientId, secret: envSecret }
  return cachedCreds
}

/** Mint a sandbox public_token straight from Plaid — no widget involved. */
export async function mintSandboxPublicToken(): Promise<string> {
  const { clientId, secret } = await plaidCreds()
  const ctx = await request.newContext()
  try {
    const response = await ctx.post(
      `${PLAID_SANDBOX}/sandbox/public_token/create`,
      {
        data: {
          client_id: clientId,
          secret,
          institution_id: SANDBOX_INSTITUTION,
          initial_products: ['transactions'],
        },
      },
    )
    if (!response.ok()) {
      throw new Error(
        `sandbox public_token/create failed: ${response.status()} ${await response.text()}`,
      )
    }
    const { public_token } = (await response.json()) as { public_token: string }
    return public_token
  } finally {
    await ctx.dispose()
  }
}

/** Exchange a freshly minted sandbox token through the real backend,
 * creating a connection (and its accounts) for the given user. */
export async function seedSandboxConnection(
  email: string,
  password: string,
): Promise<void> {
  const publicToken = await mintSandboxPublicToken()
  await exchangeViaBackend(email, password, publicToken)
}

async function exchangeViaBackend(
  email: string,
  password: string,
  publicToken: string,
): Promise<void> {
  const { ctx, csrf } = await authedContext(email, password)
  try {
    const created = await ctx.post('/api/v1/connections', {
      data: { provider: 'plaid', token: publicToken },
      headers: await csrf(),
    })
    if (!created.ok()) {
      throw new Error(
        `connection exchange failed: ${created.status()} ${await created.text()}`,
      )
    }
  } finally {
    await ctx.dispose()
  }
}

/** Poll until the seeded connection's auto-enqueued first sync completes —
 * the page only refetches inside client-triggered windows, so tests that
 * assert on a synced row must not race the worker. */
export async function waitForFirstSync(
  email: string,
  password: string,
  timeoutMs = 90_000,
): Promise<void> {
  const { ctx } = await authedContext(email, password)
  try {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const response = await ctx.get('/api/v1/connections')
      const { items } = (await response.json()) as {
        items: Array<{ last_synced_at: string | null; status: string }>
      }
      if (items.some((item) => item.last_synced_at !== null)) return
      if (items.some((item) => item.status !== 'active')) {
        throw new Error(`first sync failed: ${JSON.stringify(items)}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    throw new Error('first sync did not complete in time')
  } finally {
    await ctx.dispose()
  }
}
