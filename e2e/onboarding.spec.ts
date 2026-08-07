import { expect, type Page, test } from '@playwright/test'
import { API, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { mintSandboxPublicToken } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { continueWithPlaid, loginViaUi, setTheme } from './helpers/ui'

// F3 CP4 (#20, wireframe #5), rehomed by F10 CP1 (#87): the inferred
// first-run wizard lives on the Register now and hands off onto its
// To-review tab. The trigger is stateless (an empty ledger IS the state),
// the connect step is the F2 flow with the same network-boundary Plaid
// fake, and the whole signup → wizard → populated-queue journey below
// never touches the API by hand.

function wizard(page: Page) {
  return page.getByTestId('onboarding-wizard')
}

test('signup → wizard → currency saves → connect → honest progress → a full To-review tab of finished work', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('onboard')
  await armPlaidFake(page, 'success', await mintSandboxPublicToken())

  // Signup through the UI — the ledger is born empty.
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/accounts$/)

  // The Register infers first-run and shows the wizard, not an empty ledger.
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(wizard(page)).toBeVisible()
  await expect(wizard(page)).toContainText('Welcome to Pinch')

  // Currency pre-fills from /me; changing it saves through the enabler.
  const currency = wizard(page).getByLabel('Primary currency')
  await expect(currency).toHaveValue('USD')
  await currency.selectOption('EUR')
  await wizard(page).getByRole('button', { name: 'Continue' }).click()
  await expect(wizard(page)).toContainText('Connect your first account')
  const me = await page.request.get(`${API}/api/v1/auth/me`)
  expect(
    ((await me.json()) as { primary_currency: string }).primary_currency,
  ).toBe('EUR')

  // The wizard holds in dark too (wireframe pair 1s/1s-d).
  await setTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(wizard(page)).toBeVisible()
  await setTheme(page, 'System')

  // Connect a bank — the wizard's card opens the same provider picker the
  // connections page uses (F8 CP0); Plaid's Continue reaches the F2 flow.
  await wizard(page)
    .getByRole('button', { name: /Connect a bank/ })
    .click()
  await expect(page.getByTestId('provider-picker')).toBeVisible()
  await continueWithPlaid(page)

  // Real progress now (F5 CP6): the connection's status voice, and — riding the
  // same bounded poll — the classification counts F3's #20 cut come back real.
  const progress = page.getByTestId('onboarding-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toContainText(/Syncing|Penny finished/)

  // Sync completes onto the landing card: the real stats, and an explicit
  // "Review N transactions →" hand-off (the poll has stopped — the card only
  // renders once sync lands).
  const cta = page.getByTestId('onboarding-review-cta')
  await expect(cta).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('onboarding-stats')).toContainText(
    /Categorizing \d+\/\d+/,
  )

  // Clicking it lands the user straight on the To-review tab — a full
  // queue of finished work.
  await cta.click()
  await expect(page).toHaveURL(/\/register\?view=review$/)
  await expect(page.getByTestId('queue-row').first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByTestId('review-count')).not.toHaveText('0')
})

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
