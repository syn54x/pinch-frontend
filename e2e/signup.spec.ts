import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { verificationTokenFor } from './helpers/mail'

test('signup → banner → fish token → verify → banner gone', async ({
  page,
}) => {
  const email = uniqueEmail('signup')

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Lands authenticated-unverified, banner nudging.
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Verify your email')).toBeVisible()

  // Dismissible, and gates nothing: the accounts page is fully usable.
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Verify your email')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()

  // The emailed link completes the journey; back in the app the banner is
  // gone for real — verified, not merely dismissed.
  const token = await verificationTokenFor(email)
  await page.goto(`/verify-email?token=${token}`)
  await expect(page.getByText('Email verified')).toBeVisible()
  await page.getByRole('link', { name: 'Go to Pinch' }).click()
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Verify your email')).not.toBeVisible()
})

test('signup with a taken email shows an inline error', async ({ page }) => {
  const email = uniqueEmail('taken')
  await seedUser(email, PASSWORD)

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toContainText('already exists')
  await expect(page).toHaveURL(/\/signup/)
})
