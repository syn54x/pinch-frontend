import { readFile } from 'node:fs/promises'
import { request } from '@playwright/test'

// Plaid sandbox helpers: mint public tokens without the Link widget (the
// backend's own tests use the same shortcut) and seed real sandbox
// connections through the real backend exchange.

const PLAID_SANDBOX = 'https://sandbox.plaid.com'
const API = 'http://localhost:8100'

// First Platypus Bank — Plaid's canonical sandbox institution.
const SANDBOX_INSTITUTION = 'ins_109508'

let cachedCreds: { clientId: string; secret: string } | null = null

/** Sandbox credentials: process env in CI, the backend's .env locally. */
async function plaidCreds(): Promise<{ clientId: string; secret: string }> {
  if (cachedCreds) return cachedCreds
  let clientId = process.env.PINCH_PLAID_CLIENT_ID
  let secret = process.env.PINCH_PLAID_SECRET
  if (!clientId || !secret) {
    const env = await readFile(
      new URL('../../../pinch-backend/.env', import.meta.url),
      'utf8',
    ).catch(() => '')
    clientId ??= env.match(/^PINCH_PLAID_CLIENT_ID=(.+)$/m)?.[1]?.trim()
    secret ??= env.match(/^PINCH_PLAID_SECRET=(.+)$/m)?.[1]?.trim()
  }
  if (!clientId || !secret) {
    throw new Error(
      'Plaid sandbox credentials not found (env or ../pinch-backend/.env)',
    )
  }
  cachedCreds = { clientId, secret }
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
  const ctx = await request.newContext({ baseURL: API })
  try {
    await ctx.get('/health')
    const csrf = async () => {
      const state = await ctx.storageState()
      const token = state.cookies.find((c) => c.name === 'csrftoken')?.value
      if (!token) throw new Error('no csrftoken cookie in API context')
      return { 'x-csrftoken': token }
    }
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email, password },
      headers: await csrf(),
    })
    if (!login.ok()) throw new Error(`seed login failed: ${login.status()}`)
    const created = await ctx.post('/api/v1/connections', {
      data: { public_token: publicToken },
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
