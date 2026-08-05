import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { mintSandboxPublicToken } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { connectViaPicker, loginViaUi } from './helpers/ui'

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
  await connectViaPicker(page)

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
  // The enabler's masks ride along (CP3).
  await expect(
    page
      .getByTestId('account-card')
      .getByText(/···\d+/)
      .first(),
  ).toBeVisible()
})

test('cancelling the widget returns to the picker: tried mark + promoted next', async ({
  page,
}) => {
  const email = uniqueEmail('cancel')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'cancel')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await connectViaPicker(page)

  // Returned-empty (7d, F8 CP1): coming back without connecting is a
  // fork, not silence — the picker reopens, Plaid is marked tried with
  // the honest copy (cancel and can't-find-my-bank are the same event
  // to us), and the next configured method is promoted.
  const picker = page.getByTestId('provider-picker')
  await expect(picker).toBeVisible()
  await expect(picker).toContainText(
    'Nothing was connected — pick another way in.',
  )
  const plaidCard = page.getByTestId('provider-card-plaid')
  await expect(plaidCard).toContainText('tried')
  await expect(plaidCard).toContainText(
    'Came back without connecting. Plaid doesn’t tell us why.',
  )
  await expect(
    plaidCard.getByRole('button', { name: 'Try Plaid again' }),
  ).toBeEnabled()
  await expect(
    page.getByTestId('provider-card-mx').getByRole('button', {
      name: 'Try MX',
      exact: true,
    }),
  ).toBeVisible()

  // Still no residue: nothing was created, nothing reads as an error.
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Closing the picker ends the attempt: a fresh open starts neutral.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await expect(picker).toContainText('Choose how Pinch reaches your bank')
  await expect(plaidCard).not.toContainText('tried')
})

test('a widget error shows an inline notice', async ({ page }) => {
  const email = uniqueEmail('widgeterr')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'error')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await connectViaPicker(page)

  // A widget error reopens the picker with the notice inline.
  await expect(page.getByTestId('provider-picker')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Simulated Plaid failure')
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
})
