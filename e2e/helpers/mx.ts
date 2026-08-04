import { request } from '@playwright/test'
import { authedContext } from './api'
import { backendDotenv, dotenvValue } from './env'

// MX integration-sandbox helpers — the plaid.ts analog for the suite's
// second non-hermetic edge (F8 CP1). The widget fake answers a member
// guid; these helpers make that guid REAL: a member created API-side
// under the backend's own enrollment user, so complete_connect's
// verify-under-our-enrollment read passes against live MX responses.
//
// MX Bank (`mxbank`) is the scripted test institution: user `mxuser`,
// any password → CONNECTED (backend CP0 spike, empirical).

const MX_API = 'https://int-api.mx.com'
const MX_ACCEPT = 'application/vnd.mx.api.v1+json'

let cachedCreds: { clientId: string; apiKey: string } | null = null

/** Integration credentials: process env in CI, the backend's .env locally.
 * All-or-nothing per source — never a mixed pair. */
async function mxCreds(): Promise<{ clientId: string; apiKey: string }> {
  if (cachedCreds) return cachedCreds
  const envClientId = process.env.PINCH_MX_CLIENT_ID
  const envApiKey = process.env.PINCH_MX_API_KEY
  if (envClientId && envApiKey) {
    cachedCreds = { clientId: envClientId, apiKey: envApiKey }
    return cachedCreds
  }
  const dotenv = await backendDotenv()
  const clientId = dotenvValue(dotenv, 'PINCH_MX_CLIENT_ID')
  const apiKey = dotenvValue(dotenv, 'PINCH_MX_API_KEY')
  if (!clientId || !apiKey) {
    throw new Error(
      'MX integration credentials not found (process env or backend .env)',
    )
  }
  cachedCreds = { clientId, apiKey }
  return cachedCreds
}

async function mxRequest(
  method: 'get' | 'post' | 'delete',
  path: string,
  data?: unknown,
): Promise<Record<string, unknown>> {
  const { clientId, apiKey } = await mxCreds()
  const ctx = await request.newContext({
    baseURL: MX_API,
    extraHTTPHeaders: {
      Accept: MX_ACCEPT,
      // Preemptive Basic auth: MX 401s without a challenge, so
      // Playwright's httpCredentials (challenge-response) never fires.
      Authorization: `Basic ${Buffer.from(`${clientId}:${apiKey}`).toString('base64')}`,
    },
  })
  try {
    const response = await ctx[method](path, data ? { data } : undefined)
    if (!response.ok()) {
      throw new Error(
        `MX ${method.toUpperCase()} ${path} failed: ${response.status()} ${await response.text()}`,
      )
    }
    const body = await response.text()
    return body ? (JSON.parse(body) as Record<string, unknown>) : {}
  } finally {
    await ctx.dispose()
  }
}

/** Every user guid on the dev account (one page — the account is small). */
export async function listMxUserGuids(): Promise<string[]> {
  const data = await mxRequest('get', '/users?records_per_page=1000')
  const users = (data.users ?? []) as Array<{ guid: string }>
  return users.map((user) => user.guid)
}

/** Teardown sweep: delete every user the run created (enrollment users
 * the backend minted per test ledger), so the dev account stays clean.
 * Baseline-scoped on purpose — never touches pre-existing users. */
export async function deleteMxUsersExcept(
  baseline: Set<string>,
): Promise<void> {
  for (const guid of await listMxUserGuids()) {
    if (!baseline.has(guid)) await mxRequest('delete', `/users/${guid}`)
  }
}

/** Mint an MX connect session through the real backend as this user —
 * the lazy enrollment ensure: the backend creates its provider-side
 * user container on the first session for a ledger. */
async function createMxSessionViaBackend(
  email: string,
  password: string,
): Promise<void> {
  const { ctx, csrf } = await authedContext(email, password)
  try {
    const session = await ctx.post('/api/v1/connections/connect-session', {
      data: { provider: 'mx' },
      headers: await csrf(),
    })
    if (!session.ok()) {
      throw new Error(
        `mx connect-session failed: ${session.status()} ${await session.text()}`,
      )
    }
  } finally {
    await ctx.dispose()
  }
}

/** Seed a real MX Bank member under this user's enrollment: bootstrap
 * the enrollment through the backend, find its fresh user container,
 * create the member with MX Bank's scripted credentials, and (for the
 * CONNECTED default) wait out aggregation (~14s in sandbox) — the guid
 * the widget fake will answer with.
 *
 * MX Bank scripts the member's terminal status off the PASSWORD value
 * (backend research doc): any non-scripted password → CONNECTED;
 * `challenge`/`options`/`image` → CHALLENGED; `UNAUTHORIZED`/`INVALID`/
 * `DISABLED` → DENIED. Repair-state fixtures (F8 CP2's MX repair specs)
 * pass `bankPassword` + the status they script for. */
export async function seedMxMember(
  email: string,
  password: string,
  options: {
    /** MX Bank's scripted password knob; default connects. */
    bankPassword?: string
    /** The scripted terminal status to wait for; default CONNECTED. */
    untilStatus?: 'CONNECTED' | 'CHALLENGED' | 'DENIED'
  } = {},
): Promise<{ userGuid: string; memberGuid: string }> {
  const before = new Set(await listMxUserGuids())
  await createMxSessionViaBackend(email, password)
  const created = (await listMxUserGuids()).filter((guid) => !before.has(guid))
  if (created.length !== 1) {
    throw new Error(
      `expected exactly one fresh MX user after connect-session, saw ${created.length}`,
    )
  }
  const userGuid = created[0]

  const credentialData = await mxRequest(
    'get',
    '/institutions/mxbank/credentials',
  )
  const credentials = (credentialData.credentials ?? []) as Array<{
    guid: string
    field_name?: string
    label?: string
  }>
  if (credentials.length === 0)
    throw new Error('mxbank exposed no credential fields')
  const memberData = await mxRequest('post', `/users/${userGuid}/members`, {
    member: {
      institution_code: 'mxbank',
      credentials: credentials.map((credential) => ({
        guid: credential.guid,
        value: /password/i.test(credential.field_name ?? credential.label ?? '')
          ? (options.bankPassword ?? 'e2e-any-password')
          : 'mxuser',
      })),
    },
  })
  const memberGuid = (memberData.member as { guid: string }).guid

  // memberConnected semantics: a CONNECTED member is only usable once
  // aggregation finishes — poll the lean status probe the way the widget
  // would. Scripted repair states settle on their status alone.
  const target = options.untilStatus ?? 'CONNECTED'
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const statusData = await mxRequest(
      'get',
      `/users/${userGuid}/members/${memberGuid}/status`,
    )
    const member = statusData.member as {
      connection_status: string
      has_processed_accounts: boolean
    }
    if (
      member.connection_status === target &&
      (target !== 'CONNECTED' || member.has_processed_accounts)
    ) {
      return { userGuid, memberGuid }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`MX sandbox member did not reach ${target} in time`)
}
