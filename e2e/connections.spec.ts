import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { seedSandboxConnection } from './helpers/plaid'
import { loginViaUi } from './helpers/ui'

test('a sandbox connection renders with status, sync state, and account count', async ({
  page,
}) => {
  const email = uniqueEmail('conn')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await expect(page).toHaveURL(/\/connections$/)

  const row = page.getByTestId('connection-card').first()
  // Institution name arrives with the backend enabler (CP3) — until then
  // the row degrades honestly.
  await expect(row.getByText('Plaid connection')).toBeVisible()
  await expect(row.getByText('active')).toBeVisible()
  await expect(row.getByText('Never synced')).toBeVisible()
  // [1-9]: "0 accounts" would mean the exchange created none — a failure.
  await expect(row.getByText(/[1-9]\d* accounts?/)).toBeVisible()
})

test('disconnect severs the connection but accounts survive as manual', async ({
  page,
}) => {
  const email = uniqueEmail('sever')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  // Exchange created real sandbox accounts — visible before disconnect.
  await expect(page.getByTestId('account-card').first()).toBeVisible()
  const accountCount = await page.getByTestId('account-card').count()

  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Disconnect' }).click()
  // The confirm tells the truth: sever, never destroy.
  await expect(page.getByText(/accounts and their history stay/)).toBeVisible()
  await page
    .getByRole('button', { name: 'Disconnect', exact: true })
    .last()
    .click()

  await expect(page.getByTestId('connection-card')).toHaveCount(0)
  await expect(page.getByText(/No connections yet/)).toBeVisible()

  // The accounts live on — and as *manual* accounts, per the AC.
  await page.getByRole('link', { name: 'Accounts' }).click()
  await expect(page.getByTestId('account-card')).toHaveCount(accountCount)
  await expect(
    page.getByTestId('account-card').first().getByText('manual'),
  ).toBeVisible()
})
