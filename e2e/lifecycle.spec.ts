import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { forceConnectionStatus } from './helpers/db'
import { seedSandboxConnection, waitForFirstSync } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { loginViaUi } from './helpers/ui'

test('refresh advances last-synced with in-place feedback', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('refresh')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()

  const row = page.getByTestId('connection-card')
  await expect(row.getByText(/Synced /)).toBeVisible()

  await row.getByRole('button', { name: 'Refresh' }).click()
  await expect(row.getByText('Syncing…')).toBeVisible()
  // Disabled while the window is open — no double-queues.
  await expect(row.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(row.getByText(/Synced /)).toBeVisible({ timeout: 90_000 })
  await expect(row.getByRole('button', { name: 'Refresh' })).toBeEnabled()
})

test('a reauth-required connection repairs back to active', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('repair')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)
  // Stage what a provider reauth failure leaves behind; the healthy item
  // underneath lets the full repair → sync → active arc run for real.
  await forceConnectionStatus(email, 'reauth_required')
  await armPlaidFake(page, 'success')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  const row = page.getByTestId('connection-card')
  await expect(row.getByText('reauth_required')).toBeVisible()
  await expect(row.getByText('needs your attention')).toBeVisible()

  // The badge's call to action: Repair opens Link in update mode (no
  // exchange on success) and kicks a follow-up sync.
  await row.getByRole('button', { name: 'Repair' }).click()
  await expect(row.getByText(/Syncing|First sync/)).toBeVisible()
  await expect(row.getByText('active')).toBeVisible({ timeout: 90_000 })
  await expect(row.getByText(/Synced /)).toBeVisible()
  await expect(row.getByRole('button', { name: 'Repair' })).toHaveCount(0)
})

test('credential-less repair surfaces the backend message honestly', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('nocreds')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)
  await forceConnectionStatus(email, 'reauth_required', {
    stripCredentials: true,
  })
  await armPlaidFake(page, 'success')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  const row = page.getByTestId('connection-card')

  await row.getByRole('button', { name: 'Repair' }).click()
  await expect(row.getByRole('alert')).toContainText(/no provider credentials/)
  // The dead-end's remaining verb is still there.
  await expect(row.getByRole('button', { name: 'Disconnect' })).toBeVisible()
})
