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
  method: 'get' | 'post' | 'put' | 'delete',
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

/** The member guids under one enrollment user — how the dupe-guard spec
 * proves "keep the existing" really deleted the MX-side member (the
 * backend's disconnect cleanup), not just the Pinch row. */
export async function listMxMemberGuids(userGuid: string): Promise<string[]> {
  const data = await mxRequest(
    'get',
    `/users/${userGuid}/members?records_per_page=100`,
  )
  const members = (data.members ?? []) as Array<{ guid: string }>
  return members.map((member) => member.guid)
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

  const memberData = await mxRequest('post', `/users/${userGuid}/members`, {
    member: {
      institution_code: 'mxbank',
      credentials: await mxBankCredentialValues(
        options.bankPassword ?? 'e2e-any-password',
      ),
    },
  })
  const memberGuid = (memberData.member as { guid: string }).guid

  await waitForMxMemberStatus(
    userGuid,
    memberGuid,
    options.untilStatus ?? 'CONNECTED',
  )
  return { userGuid, memberGuid }
}

/** MX Bank's credential fields, filled: any non-password field takes the
 * scripted username, the password field takes the scripted knob. */
async function mxBankCredentialValues(
  bankPassword: string,
): Promise<Array<{ guid: string; value: string }>> {
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
  return credentials.map((credential) => ({
    guid: credential.guid,
    value: /password/i.test(credential.field_name ?? credential.label ?? '')
      ? bankPassword
      : 'mxuser',
  }))
}

/** Poll the lean status probe the way the widget would. A CONNECTED
 * member is only usable once aggregation finishes; scripted repair
 * states (CHALLENGED/DENIED) settle on their status alone. */
export async function waitForMxMemberStatus(
  userGuid: string,
  memberGuid: string,
  target: 'CONNECTED' | 'CHALLENGED' | 'DENIED',
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
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
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`MX sandbox member did not reach ${target} in time`)
}

/** Rewrite the member's scripted password — the repair spec's two knobs:
 * a bad password breaks the login for real (DENIED after the next
 * aggregation), a good one stands in for the user fixing it inside the
 * reconnect widget (the e2e fake can't type into MX Bank). Updating
 * credentials queues an MX-side aggregation; the explicit nudge covers
 * sandbox lag and tolerates an already-running one. */
export async function setMxMemberPassword(
  userGuid: string,
  memberGuid: string,
  bankPassword: string,
): Promise<void> {
  await mxRequest('put', `/users/${userGuid}/members/${memberGuid}`, {
    member: { credentials: await mxBankCredentialValues(bankPassword) },
  })
  try {
    await mxRequest(
      'post',
      `/users/${userGuid}/members/${memberGuid}/aggregate`,
    )
  } catch {
    // An aggregation the credential update already started answers 409 —
    // the wait-for-status below (caller-side) is the real gate.
  }
}
