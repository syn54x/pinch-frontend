import { expect, type Page, test } from '@playwright/test'
import { API, PASSWORD, uniqueEmail } from './helpers/api'
import { mintSandboxPublicToken } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { continueWithPlaid, setTheme } from './helpers/ui'

// Onboarding's full first-run journey, the LIVE half (see onboarding.spec.ts
// for the hermetic paths): the connect step mints a real sandbox token and
// the progress card waits on a genuine Plaid first sync, so this file rides
// the chromium-live project with the rest of the sandbox family.

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
