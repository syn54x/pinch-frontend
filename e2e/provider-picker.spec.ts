import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { seedSandboxConnection } from './helpers/plaid'
import { loginViaUi } from './helpers/ui'

// The provider picker (F8 CP0, wireframe 7a): everything factual is
// catalog-driven — the cards and the capability chips — against the real
// backend's catalog endpoint. Since F8 CP1 the e2e backend configures
// BOTH providers (Plaid + MX integration creds), so the greyed
// unconfigured rendering no longer has a live e2e surface; the catalog
// only carries providers that exist, and both exist here.

test('the picker renders catalog-driven cards with per-provider chips', async ({
  page,
}) => {
  const email = uniqueEmail('picker')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()

  const picker = page.getByTestId('provider-picker')
  await expect(picker).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: 'Connect a bank' }),
  ).toContainText('Choose how Pinch reaches your bank')

  // Plaid: configured, all four capability atoms → three chips (holdings
  // and activity read as one), Continue live.
  const plaid = page.getByTestId('provider-card-plaid')
  await expect(plaid).toContainText('recommended')
  await expect(plaid).toContainText('transactions')
  await expect(plaid).toContainText('balances')
  await expect(plaid).toContainText('holdings & activity')
  await expect(
    plaid.getByRole('button', { name: 'Continue with Plaid' }),
  ).toBeEnabled()

  // MX: configured (F8 CP1), transactions + balances from the catalog —
  // and the missing holdings atom said out loud as a limit, muted.
  const mx = page.getByTestId('provider-card-mx')
  await expect(mx).not.toContainText('unavailable')
  await expect(mx).toContainText('transactions')
  await expect(mx).toContainText('balances')
  await expect(mx).toContainText('no holdings yet')
  await expect(
    mx.getByRole('button', { name: 'Continue with MX' }),
  ).toBeEnabled()

  // A fresh ledger has no "already connected" row to warn with.
  await expect(page.getByTestId('already-connected')).toHaveCount(0)

  // Escape closes like every app dialog, focus returning to the trigger.
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Connect bank' })).toBeFocused()

  // The footer's manual escape leads out of the picker to Accounts.
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page
    .getByRole('button', { name: 'Add the account manually instead' })
    .click()
  await expect(page).toHaveURL(/\/accounts$/)
})

test('the already-connected row lists existing connections with provider badges', async ({
  page,
}) => {
  const email = uniqueEmail('picker-dupe')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()

  // The one pre-flight duplicate warning we can run: the row rides ahead
  // of the cards, naming the institution and its provider.
  const chip = page.getByTestId('connected-chip')
  await expect(chip).toHaveCount(1)
  await expect(chip).toContainText('First Platypus Bank')
  await expect(chip).toContainText(/plaid/i)
})

test('the onboarding wizard opens the same picker from its connect card', async ({
  page,
}) => {
  const email = uniqueEmail('picker-wizard')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  await page.getByRole('link', { name: 'Register' }).click()
  const wizard = page.getByTestId('onboarding-wizard')
  await expect(wizard).toBeVisible()
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: /Connect a bank/ }).click()

  // Same component, same catalog: one flow for first-run and settings.
  await expect(page.getByTestId('provider-picker')).toBeVisible()
  await expect(page.getByTestId('provider-card-plaid')).toBeVisible()
  await expect(page.getByTestId('provider-card-mx')).toBeVisible()

  // Its manual footer lands on the wizard's own manual step.
  await page
    .getByRole('button', { name: 'Add the account manually instead' })
    .click()
  await expect(page.getByTestId('provider-picker')).toHaveCount(0)
  await expect(wizard).toContainText('Add an account manually')
})
