import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { mintSandboxPublicToken } from './helpers/plaid'
import { loginViaUi } from './helpers/ui'

/** Serve the fake Plaid script and arm its knobs. */
async function armPlaidFake(
  page: Page,
  mode: 'success' | 'cancel' | 'error',
  publicToken?: string,
) {
  await page.route('**/link-initialize.js', (route) =>
    route.fulfill({
      path: 'e2e/fixtures/plaid-link.js',
      contentType: 'application/javascript',
    }),
  )
  await page.addInitScript(
    (knobs: { mode: 'success' | 'cancel' | 'error'; token?: string }) => {
      window.__E2E_PLAID_MODE = knobs.mode
      window.__E2E_PLAID_PUBLIC_TOKEN = knobs.token
    },
    { mode, token: publicToken },
  )
}

test('connect a bank: widget → exchange → first sync → balances materialize', async ({
  page,
}) => {
  // The real sandbox sync (worker job + Plaid API) can outlive the default
  // test budget; the poll cap is 2min, so give the journey room to finish.
  test.setTimeout(150_000)
  const email = uniqueEmail('connect')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'success', await mintSandboxPublicToken())

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()

  // The exchange lands the row immediately, in first-sync state.
  const row = page.getByTestId('connection-card')
  await expect(row).toHaveCount(1)
  await expect(row.getByText(/First sync|Syncing/)).toBeVisible()

  // The poll window sees the worker finish; no reload anywhere.
  await expect(row.getByText(/Synced /)).toBeVisible({ timeout: 90_000 })

  // Balances materialized on the accounts page through the invalidation —
  // scoped to the cards so only real balances satisfy it.
  await page.getByRole('link', { name: 'Accounts' }).click()
  await expect(
    page.getByTestId('account-card').getByText(/\$\d/).first(),
  ).toBeVisible()
})

test('cancelling the widget leaves no residue', async ({ page }) => {
  const email = uniqueEmail('cancel')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'cancel')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()

  // The flow ends (button re-enables) — then assert nothing was left behind.
  await expect(page.getByRole('button', { name: 'Connect bank' })).toBeEnabled()
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a widget error shows an inline notice', async ({ page }) => {
  const email = uniqueEmail('widgeterr')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'error')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()

  await expect(page.getByRole('alert')).toContainText('Simulated Plaid failure')
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
})
