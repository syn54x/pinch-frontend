import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import {
  deleteMxUsersExcept,
  listMxUserGuids,
  seedMxMember,
  setMxMemberPassword,
  waitForMxMemberStatus,
} from './helpers/mx'
import { armMxFake } from './helpers/mx-fake'
import { loginViaUi } from './helpers/ui'

// MX repair (F8 CP2, wireframe 1m): a broken MX login surfaces
// reauth_required with a Repair that opens the reconnect-mode widget in
// the same Pinch-owned sheet — one button, per-provider widget behind
// it. MX Bank's scripted passwords make the break REAL (something
// Plaid's sandbox never allowed): a bad password drives the member to
// DENIED, the sync engine maps it to reauth_required, and the heal is a
// genuine status round-trip. One member carries the whole arc — the
// sandbox allows one member per institution per user, so the spec
// sequences break and repair on the same login instead of minting a
// second broken member.

let baselineUsers: Set<string>
test.beforeAll(async () => {
  baselineUsers = new Set(await listMxUserGuids())
})
test.afterAll(async () => {
  await deleteMxUsersExcept(baselineUsers)
})

test('a denied MX login surfaces reauth_required; Repair opens the reconnect sheet and heals to active', async ({
  page,
}) => {
  // Three real MX aggregation waits ride this spec (connect, break, fix).
  test.setTimeout(360_000)
  const email = uniqueEmail('mx-repair')
  await seedUser(email, PASSWORD)
  const { userGuid, memberGuid } = await seedMxMember(email, PASSWORD)
  await armMxFake(page, 'success', memberGuid)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page.getByRole('button', { name: 'Continue with MX' }).click()
  const row = page.getByTestId('connection-card')
  await expect(row).toHaveCount(1, { timeout: 60_000 })
  // Let the first sync land before breaking anything — the repair sync's
  // outcome stays unambiguous.
  await expect(row.getByText(/Synced /)).toBeVisible({ timeout: 90_000 })

  // Break the login for real: MX Bank scripts DENIED off the password.
  await setMxMemberPassword(userGuid, memberGuid, 'INVALID')
  await waitForMxMemberStatus(userGuid, memberGuid, 'DENIED')

  // Refresh probes the member: DENIED maps to reauth_required (M13) —
  // the row says so, and the status badge brings Repair with it.
  await row.getByRole('button', { name: 'Refresh' }).click()
  await expect(row.getByText('reauth_required')).toBeVisible({
    timeout: 90_000,
  })
  const repair = row.getByRole('button', { name: 'Repair' })
  await expect(repair).toBeVisible()

  // Fix the credentials API-side before walking the widget: the e2e fake
  // can't type the right password into MX Bank, so this stands in for
  // what the user does INSIDE the real reconnect widget.
  await setMxMemberPassword(userGuid, memberGuid, 'e2e-any-password')
  await waitForMxMemberStatus(userGuid, memberGuid, 'CONNECTED')

  // Repair routes by provider: an MX row opens the MX sheet (reconnect
  // mode), never Plaid Link. Success needs no completion call — the
  // follow-up sync proves the fix.
  await repair.click()
  const sheet = page.getByTestId('mx-connect-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveCount(0, { timeout: 60_000 })
  await expect(row.getByText('active')).toBeVisible({ timeout: 90_000 })
  await expect(row.getByRole('button', { name: 'Repair' })).toHaveCount(0)
})
