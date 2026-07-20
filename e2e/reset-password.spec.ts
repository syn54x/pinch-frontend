import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { resetTokenFor } from './helpers/mail'
import { loginViaUi } from './helpers/ui'

const NEW_PASSWORD = 'staple-gun-battery-horse'

test('the reset round-trip: old password rejected, new one works', async ({
  page,
}) => {
  const email = uniqueEmail('reset')
  await seedUser(email, PASSWORD)

  await page.goto('/reset-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(/reset link is on its way/)).toBeVisible()

  const token = await resetTokenFor(email)
  await page.goto(`/reset-password?token=${token}`)
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page).toHaveURL(/\/login/)

  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toBeVisible()

  await loginViaUi(page, email, NEW_PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
})

test('requesting a reset for an unknown email looks identical', async ({
  page,
}) => {
  await page.goto('/reset-password')
  await page.getByLabel('Email').fill(uniqueEmail('never-signed-up'))
  await page.getByRole('button', { name: 'Send reset link' }).click()
  // Enumeration-safe: indistinguishable from the known-email response.
  await expect(page.getByText(/reset link is on its way/)).toBeVisible()
})

test('an invalid reset token shows an inline error', async ({ page }) => {
  await page.goto('/reset-password?token=not-a-real-token')
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/reset-password/)
})
