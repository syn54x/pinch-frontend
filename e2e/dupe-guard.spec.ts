import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { stageConnection } from './helpers/db'
import {
  deleteMxUsersExcept,
  listMxMemberGuids,
  listMxUserGuids,
  seedMxMember,
} from './helpers/mx'
import { armMxFake } from './helpers/mx-fake'
import { armPlaidFake } from './helpers/plaid-fake'
import { loginViaUi } from './helpers/ui'

// The duplicate guard (F8 CP2, wireframe 7e): a soft confirm AFTER the
// widget completes, because institution identity is only knowable on the
// way back. The "already here" connection is DB-staged: fabricating it
// through a real provider walk would either need Plaid sandbox tokens
// (locally blocked since the production cutover) or a second MX Bank
// member — and the MX sandbox allows one member per institution per
// user. The staged row is only ever read through the list.

test.describe('MX side — guard after completion', () => {
  // Every "Continue with MX" mints a lazy enrollment user on the MX dev
  // account; sweep everything this run created.
  let baselineUsers: Set<string>
  test.beforeAll(async () => {
    baselineUsers = new Set(await listMxUserGuids())
  })
  test.afterAll(async () => {
    await deleteMxUsersExcept(baselineUsers)
  })

  test('keep the existing connection deletes the just-created one, MX member included', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const email = uniqueEmail('mx-guard-keep')
    await seedUser(email, PASSWORD)
    // Cross-provider staging: a Plaid row whose name matches what MX
    // will name the fresh walk — the soft name heuristic's home turf.
    await stageConnection(email, {
      provider: 'plaid',
      institutionName: 'MX Bank',
      providerInstitutionId: 'ins_e2e_mxbank',
    })
    const { userGuid, memberGuid } = await seedMxMember(email, PASSWORD)
    await armMxFake(page, 'success', memberGuid)

    await loginViaUi(page, email, PASSWORD)
    await page.getByRole('link', { name: 'Connections' }).click()
    await expect(page.getByTestId('connection-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Connect bank' }).click()
    await page.getByRole('button', { name: 'Continue with MX' }).click()

    // MX timing: the institution is only known once completion created
    // the connection — so the guard fires after the sheet leaves.
    const guard = page.getByTestId('duplicate-guard')
    await expect(guard).toBeVisible({ timeout: 60_000 })
    await expect(guard).toContainText(
      'You just connected a bank that’s already here',
    )
    await expect(guard).toContainText('discards what you just set up at MX')
    const existingCard = guard.getByTestId('duplicate-existing')
    await expect(existingCard).toContainText('MX Bank')
    await expect(existingCard).toContainText('Plaid')
    // The name heuristic admits it is soft (7e).
    await expect(guard).toContainText('We matched on the institution name')

    await guard
      .getByRole('button', { name: 'Keep the existing connection' })
      .click()
    await expect(guard).toHaveCount(0)

    // Zero new artifacts: only the staged connection remains…
    await expect(page.getByTestId('connection-card')).toHaveCount(1)
    await expect(
      page.getByTestId('connection-card').getByTestId('provider-badge'),
    ).toHaveText('Plaid')
    // …its accounts went with it (the hard-delete may still be finishing
    // when the modal closes — the retries absorb it)…
    await page.getByRole('link', { name: 'Accounts' }).click()
    await expect(page.getByTestId('account-card')).toHaveCount(0, {
      timeout: 30_000,
    })
    // …and the MX-side member is gone (disconnect deletes the member —
    // the 7e annotation's quiet cleanup).
    await expect
      .poll(() => listMxMemberGuids(userGuid), { timeout: 30_000 })
      .toEqual([])
  })

  test('add it anyway keeps both connections side by side', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const email = uniqueEmail('mx-guard-add')
    await seedUser(email, PASSWORD)
    await stageConnection(email, {
      provider: 'plaid',
      institutionName: 'MX Bank',
      providerInstitutionId: 'ins_e2e_mxbank',
    })
    const { memberGuid } = await seedMxMember(email, PASSWORD)
    await armMxFake(page, 'success', memberGuid)

    await loginViaUi(page, email, PASSWORD)
    await page.getByRole('link', { name: 'Connections' }).click()
    await page.getByRole('button', { name: 'Connect bank' }).click()
    await page.getByRole('button', { name: 'Continue with MX' }).click()

    const guard = page.getByTestId('duplicate-guard')
    await expect(guard).toBeVisible({ timeout: 60_000 })
    await guard.getByRole('button', { name: 'Add it anyway' }).click()
    await expect(guard).toHaveCount(0)

    // The explicit escape: the parallel connection stands, provider as
    // quiet metadata on each row (1m).
    const cards = page.getByTestId('connection-card')
    await expect(cards).toHaveCount(2)
    await expect(
      cards.getByTestId('provider-badge').getByText('Plaid'),
    ).toBeVisible()
    await expect(
      cards.getByTestId('provider-badge').getByText('MX', { exact: true }),
    ).toBeVisible()
  })
})

test.describe('Plaid side — guard before the exchange', () => {
  test('an id-matched institution raises the guard pre-exchange; keep never completes', async ({
    page,
  }) => {
    const email = uniqueEmail('plaid-guard')
    await seedUser(email, PASSWORD)
    // Same-provider staging: the guard matches on Plaid's own
    // institution id — no name heuristic involved.
    await stageConnection(email, {
      provider: 'plaid',
      institutionName: 'First Platypus Bank',
      providerInstitutionId: 'ins_e2e_dupe',
    })
    // The fake Link's onSuccess metadata names the same institution; its
    // public token is fake — if the app ever tried to exchange it, the
    // backend would answer a loud error. Keep-existing must never try.
    await armPlaidFake(page, 'success', undefined, {
      institution_id: 'ins_e2e_dupe',
      name: 'First Platypus Bank',
    })

    await loginViaUi(page, email, PASSWORD)
    await page.getByRole('link', { name: 'Connections' }).click()
    await expect(page.getByTestId('connection-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Connect bank' }).click()
    await page.getByRole('button', { name: 'Continue with Plaid' }).click()

    const guard = page.getByTestId('duplicate-guard')
    await expect(guard).toBeVisible({ timeout: 30_000 })
    await expect(guard.getByTestId('duplicate-existing')).toContainText(
      'First Platypus Bank',
    )
    // An id match is the provider's own identity — the name-honesty line
    // stays out of the way.
    await expect(guard).not.toContainText('We matched on the institution name')

    await guard
      .getByRole('button', { name: 'Keep the existing connection' })
      .click()
    await expect(guard).toHaveCount(0)

    // The token was never exchanged: no new row, no error surfaced.
    await expect(page.getByTestId('connection-card')).toHaveCount(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
