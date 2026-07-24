import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// The App shell (F3 CP0, wireframe #24): persistent sidebar + top bar around
// every authed surface, a lean nav, and `/` landing on the Dashboard (F5 CP5).

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

test('/ redirects an authed user onto the Dashboard', async ({ page }) => {
  const email = uniqueEmail('shell-root')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  // The top bar carries the screen title.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('logged out, / funnels through login and still lands on the Dashboard', async ({
  page,
}) => {
  const email = uniqueEmail('shell-funnel')
  await seedUser(email, PASSWORD)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?.*redirect/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('the nav is exactly Dashboard, Inbox, Register, Net Worth, Recurring, Accounts, Setup → Connections — no Penny, no ⌘K', async ({
  page,
}) => {
  const email = uniqueEmail('shell-lean')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Exactly these destinations, in wireframe order — no disabled items,
  // no stubs.
  await expect(primaryNav(page).getByRole('link')).toHaveText([
    'Dashboard',
    'Inbox',
    'Register',
    'Net Worth',
    'Recurring',
    'Accounts',
    'Connections',
  ])
  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('Setup')).toBeVisible() // the section label
  // exact: the fake e2e email domain also contains "pinch".
  await expect(sidebar.getByText('Pinch', { exact: true })).toBeVisible()
  await expect(sidebar.getByText(email)).toBeVisible() // the user row

  // No Penny affordances and no command palette until their features exist.
  await expect(page.getByText(/Penny/)).toHaveCount(0)
  await expect(page.getByText('⌘K')).toHaveCount(0)
})

test('navigation moves between surfaces and marks the active item', async ({
  page,
}) => {
  const email = uniqueEmail('shell-nav')
  // One account, so the Inbox shows its empty state — an EMPTY ledger now
  // mounts Onboarding instead (CP4), which is that surface's own spec.
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Accounts' }),
  ).toHaveAttribute('aria-current', 'page')

  // Inbox mounts with its designed empty state, not a blank.
  await primaryNav(page).getByRole('link', { name: 'Inbox' }).click()
  await expect(page).toHaveURL(/\/inbox$/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Inbox' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await expect(page.getByText('Nothing to review')).toBeVisible()

  // Register mounts with its designed empty state: the ledger's column
  // header (now permanent list chrome, CP1) over an honest "nothing yet".
  await primaryNav(page).getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()
  await expect(page.getByText('Payee', { exact: true })).toBeVisible()
  await expect(page.getByText('Amount', { exact: true })).toBeVisible()
  await expect(
    page.getByTestId('register-empty').getByText('No transactions yet'),
  ).toBeVisible()

  await primaryNav(page).getByRole('link', { name: 'Connections' }).click()
  await expect(page).toHaveURL(/\/connections$/)
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
})

test('the nav is keyboard traversable with visible focus', async ({ page }) => {
  const email = uniqueEmail('shell-kbd')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Tab walks the nav in order; each stop is the real focused element.
  await primaryNav(page).getByRole('link', { name: 'Dashboard' }).focus()
  await page.keyboard.press('Tab')
  await expect(
    primaryNav(page).getByRole('link', { name: 'Inbox' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    primaryNav(page).getByRole('link', { name: 'Register' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    primaryNav(page).getByRole('link', { name: 'Net Worth' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    primaryNav(page).getByRole('link', { name: 'Recurring' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    primaryNav(page).getByRole('link', { name: 'Accounts' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  const connections = primaryNav(page).getByRole('link', {
    name: 'Connections',
  })
  await expect(connections).toBeFocused()

  // Keyboard focus is visible (focus-visible outline), and Enter navigates.
  const outline = await connections.evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  )
  expect(outline).not.toBe('none')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/connections$/)
})

test('the shell holds in dark mode', async ({ page }) => {
  const email = uniqueEmail('shell-dark')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Cycle system → light → dark via the top-bar toggle (the accessible name
  // announces each move) and confirm the shell re-renders under .dark.
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Inbox' }),
  ).toBeVisible()
})
