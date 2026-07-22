import { expect, type Page, test } from '@playwright/test'
import { API, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { mintSandboxPublicToken } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { loginViaUi } from './helpers/ui'

// F3 CP4 (#20, wireframe #5): the inferred first-run wizard. The trigger is
// stateless (an empty ledger IS the state), the connect step is the F2 flow
// with the same network-boundary Plaid fake, and the whole signup → wizard
// → populated-Inbox journey below never touches the API by hand.

function wizard(page: Page) {
  return page.getByTestId('onboarding-wizard')
}

test('signup → wizard → currency saves → connect → honest progress → a full Inbox of finished work', async ({
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

  // The Inbox infers first-run and shows the wizard, not an empty queue.
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(wizard(page)).toBeVisible()
  await expect(wizard(page)).toContainText('Welcome to Pinch')

  // Currency pre-fills from /me; changing it saves through the enabler.
  const currency = wizard(page).getByLabel('Primary currency')
  await expect(currency).toHaveValue('USD')
  await currency.selectOption('EUR')
  await wizard(page).getByRole('button', { name: 'Continue' }).click()
  await expect(wizard(page)).toContainText('Connect your first account')
  const me = await page.request.get(`${API}/api/v1/auth/me`)
  expect(((await me.json()) as { primary_currency: string }).primary_currency)
    .toBe('EUR')

  // The wizard holds in dark too (wireframe pair 1s/1s-d).
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(wizard(page)).toBeVisible()
  await page.getByRole('button', { name: /Switch to system/ }).click()

  // Connect a bank — the F2 flow behind the wizard's card.
  await wizard(page).getByRole('button', { name: /Connect a bank/ }).click()

  // Honest progress: the connection's own status voice, and none of the
  // wireframe's classification theater (#20 cuts it until M8).
  const progress = page.getByTestId('onboarding-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toContainText(/Syncing/)
  await expect(progress).not.toContainText(/Categorizing/)
  await expect(progress).not.toContainText(/recurring/)

  // First sync completion lands straight in a full Inbox — finished work,
  // no reload, seeded proposals visible immediately.
  await expect(page.getByTestId('inbox-row').first()).toBeVisible({
    timeout: 90_000,
  })
  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByTestId('inbox-count')).not.toHaveText('0')
})

test('the manual path creates an account in place — and a ledger with an account never sees the wizard', async ({
  page,
}) => {
  const email = uniqueEmail('onboard-manual')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(wizard(page)).toBeVisible()

  // Skip the currency step — every step is skippable, but skipping the
  // whole wizard isn't required to reach manual.
  await wizard(page).getByRole('button', { name: 'Continue' }).click()
  await wizard(page).getByRole('button', { name: /Add manually/ }).click()
  await wizard(page).getByLabel('Account name').fill('Everyday Checking')
  await wizard(page).getByRole('button', { name: 'Create account' }).click()

  // The wizard closes onto the Inbox empty state; the account exists.
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await page.getByRole('link', { name: 'Accounts' }).click()
  await expect(page.getByText('Everyday Checking')).toBeVisible()

  // The trigger is the ledger, not a flag: with an account present, a
  // fresh page load never shows the wizard.
  await page.reload()
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)
})

test('skip-everything lands on the Inbox empty state with a route back to connecting — and reappears next load', async ({
  page,
}) => {
  const email = uniqueEmail('onboard-skip')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(wizard(page)).toBeVisible()
  await wizard(page).getByRole('button', { name: 'Skip for now' }).click()

  // The empty state, with the way forward — never a dead end.
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  const connectLink = page.getByRole('link', { name: 'Connect a bank' })
  await expect(connectLink).toBeVisible()

  // The skip holds across in-app navigation…
  await page.getByRole('link', { name: 'Register' }).click()
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)

  // …and the route back works.
  await connectLink.click()
  await expect(page).toHaveURL(/\/connections$/)

  // Stateless: the ledger is still empty, so a fresh load infers again.
  await page.reload()
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(wizard(page)).toBeVisible()
})
