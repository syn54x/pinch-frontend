import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F3 CP4 (#20, wireframe #5), rehomed by F10 CP1 (#87): the inferred
// first-run wizard lives on the Register now and hands off onto its
// To-review tab. The trigger is stateless (an empty ledger IS the state).
// These are the hermetic paths (manual account, skip); the connect
// journey rides a real Plaid sandbox sync and lives in
// onboarding-live.spec.ts with the rest of the live family.

function wizard(page: Page) {
  return page.getByTestId('onboarding-wizard')
}

test('the manual path creates an account in place — and a ledger with an account never sees the wizard', async ({
  page,
}) => {
  const email = uniqueEmail('onboard-manual')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  await page.getByRole('link', { name: 'Register' }).click()
  await expect(wizard(page)).toBeVisible()

  // Skip the currency step — every step is skippable, but skipping the
  // whole wizard isn't required to reach manual.
  await wizard(page).getByRole('button', { name: 'Continue' }).click()
  await wizard(page)
    .getByRole('button', { name: /Add manually/ })
    .click()
  await wizard(page).getByLabel('Account name').fill('Everyday Checking')
  await wizard(page).getByRole('button', { name: 'Create account' }).click()

  // The wizard closes onto the To-review tab's empty state; the account
  // exists.
  await expect(page).toHaveURL(/\/register\?view=review$/)
  await expect(page.getByTestId('queue-empty')).toBeVisible()
  await page.getByRole('link', { name: 'Accounts' }).click()
  // Scoped to the card: the (closed) global-search listbox can hold the
  // same account name in its DOM once the accounts cache is warm.
  await expect(
    page.getByTestId('account-card').getByText('Everyday Checking'),
  ).toBeVisible()

  // The trigger is the ledger, not a flag: with an account present, a
  // fresh page load never shows the wizard.
  await page.reload()
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page.getByTestId('register-empty')).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)
})

test('skip-everything lands on the To-review empty state with a route back to connecting — and reappears next load', async ({
  page,
}) => {
  const email = uniqueEmail('onboard-skip')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  await page.getByRole('link', { name: 'Register' }).click()
  await expect(wizard(page)).toBeVisible()
  await wizard(page).getByRole('button', { name: 'Skip for now' }).click()

  // The To-review empty state, with the way forward — never a dead end.
  await expect(page).toHaveURL(/\/register\?view=review$/)
  await expect(page.getByTestId('queue-empty')).toBeVisible()
  const connectLink = page.getByRole('link', { name: 'Connect a bank' })
  await expect(connectLink).toBeVisible()

  // The skip holds across in-app navigation…
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('link', { name: 'Register' }).click()
  await page.getByTestId('view-review').click()
  await expect(page.getByTestId('queue-empty')).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)

  // …and the route back works.
  await connectLink.click()
  await expect(page).toHaveURL(/\/connections$/)

  // Stateless: the ledger is still empty, so a fresh load infers again.
  await page.reload()
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(wizard(page)).toBeVisible()
})
