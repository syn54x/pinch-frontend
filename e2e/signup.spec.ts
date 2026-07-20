import { expect, test } from '@playwright/test'
import { seedUser, uniqueEmail } from './helpers/api'

const PASSWORD = 'correct-horse-battery'

test('signup lands authenticated-unverified with the verify banner', async ({
  page,
}) => {
  const email = uniqueEmail('signup')

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Verify your email')).toBeVisible()

  // Dismissible, and gates nothing: the accounts page is fully usable.
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Verify your email')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
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
