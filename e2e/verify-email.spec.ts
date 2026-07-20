import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { verificationTokenFor } from './helpers/mail'
import { loginViaUi } from './helpers/ui'

test('the emailed link verifies the address and clears the banner', async ({
  page,
}) => {
  const email = uniqueEmail('verify')
  await seedUser(email, PASSWORD) // signup auto-sends the verification mail

  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByText('Verify your email')).toBeVisible()

  const token = await verificationTokenFor(email)
  await page.goto(`/verify-email?token=${token}`)
  await expect(page.getByText('Email verified')).toBeVisible()

  await page.getByRole('link', { name: 'Go to Pinch' }).click()
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Verify your email')).not.toBeVisible()
})

test('an invalid or expired token shows a distinct state pointing into the app', async ({
  page,
}) => {
  await page.goto('/verify-email?token=not-a-real-token')
  await expect(page.getByText(/invalid or has expired/)).toBeVisible()
  await page.getByRole('link', { name: 'Open Pinch' }).click()
  // Logged out here, so the app funnels through login — still "into the app".
  await expect(page).toHaveURL(/\/login/)
})

test('the banner resends a fresh verification link that works', async ({
  page,
}) => {
  const email = uniqueEmail('resend')
  await seedUser(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  const first = await verificationTokenFor(email)

  await page.getByRole('button', { name: 'Resend' }).click()
  await expect(page.getByText(/sent/i)).toBeVisible()

  // A fresh mail means a fresh token — poll past the one signup sent.
  await expect
    .poll(() => verificationTokenFor(email), { timeout: 10_000 })
    .not.toBe(first)
  const second = await verificationTokenFor(email)

  await page.goto(`/verify-email?token=${second}`)
  await expect(page.getByText('Email verified')).toBeVisible()
})
