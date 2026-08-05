import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { forceAccountKind } from './helpers/db'
import {
  deleteMxUsersExcept,
  listMxUserGuids,
  seedMxMember,
} from './helpers/mx'
import { armMxFake } from './helpers/mx-fake'
import { loginViaUi } from './helpers/ui'

// The capability gap (F8 CP2, wireframe 7f): an MX-connected investment
// account's holdings area explains the provider limit — explanation
// only, balance provenance labeled, no phantom actions. Driven from the
// catalog (MX ships transactions + balances) + the connection's
// provider, never hardcoded. The investment kind is DB-staged: the gap
// is about the PROVIDER, and MX Bank's fixture accounts need not carry
// a brokerage.

let baselineUsers: Set<string>
test.beforeAll(async () => {
  baselineUsers = new Set(await listMxUserGuids())
})
test.afterAll(async () => {
  await deleteMxUsersExcept(baselineUsers)
})

test('an MX investment account explains missing holdings as a provider limit', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const email = uniqueEmail('mx-gap')
  await seedUser(email, PASSWORD)
  const { memberGuid } = await seedMxMember(email, PASSWORD)
  await armMxFake(page, 'success', memberGuid)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page.getByRole('button', { name: 'Continue with MX' }).click()
  await expect(page.getByTestId('connection-card')).toHaveCount(1, {
    timeout: 60_000,
  })

  // One MX-connected account becomes a brokerage — kind drives the
  // surface, provider drives the gap.
  await forceAccountKind(email, 'investment')

  await page.getByRole('link', { name: 'Accounts' }).click()
  await page.locator('a[href*="/accounts/investments/"]').first().click()

  // Explanation only (7f): a stated limit, never an error or data loss.
  const gap = page.getByTestId('capability-gap-empty')
  await expect(gap).toBeVisible()
  await expect(gap).toContainText(
    'MX doesn’t provide holdings for this connection',
  )
  await expect(gap).toContainText(
    'Nothing here is missing from your account — the provider just doesn’t send it.',
  )
  // No phantom actions: relink and manual holdings don't exist yet, so
  // no button pretends they do.
  await expect(gap.getByRole('button')).toHaveCount(0)
  await expect(gap.getByRole('link')).toHaveCount(0)

  // Balance provenance (7f): who reported the number.
  await expect(page.getByTestId('balance-provenance')).toHaveText(
    'balance reported by MX',
  )
})
