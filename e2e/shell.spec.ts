import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi, setTheme } from './helpers/ui'

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

test('the nav is exactly Dashboard, Register, Recurring, Accounts, Setup → Connections + Categories & Rules — and Penny is reachable from every screen', async ({
  page,
}) => {
  const email = uniqueEmail('shell-lean')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Exactly these destinations, in wireframe order — no disabled items,
  // no stubs. Penny is deliberately NOT a nav item: she has her own pill.
  await expect(primaryNav(page).getByRole('link')).toHaveText([
    'Dashboard',
    // The Inbox left with F10 CP1 (#87, ADR 0002): review is the
    // Register's To-review view, and the count pill rides Register.
    'Register',
    // Net Worth left with F10 CP2 (#88): absorbed into Accounts.
    'Recurring',
    'Accounts',
    'Connections',
    'Categories & Rules', // F4 CP0 (#58)
  ])
  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('Setup')).toBeVisible() // the section label
  // exact: the fake e2e email domain also contains "pinch".
  await expect(sidebar.getByText('Pinch', { exact: true })).toBeVisible()
  await expect(sidebar.getByText(email)).toBeVisible() // the user row

  // F6 CP2 (wireframe s24): both Penny affordances, each carrying the ⌘K
  // hint — the sidebar pill above the user row, the top-bar Ask Penny pill.
  const sidebarPill = page.getByTestId('penny-pill')
  await expect(sidebarPill).toBeVisible()
  await expect(sidebarPill).toContainText('Ask Penny')
  await expect(sidebarPill).toContainText('⌘K · always here')
  const topBarPill = page.getByTestId('ask-penny')
  await expect(topBarPill).toBeVisible()
  await expect(topBarPill).toContainText('Ask Penny')
  await expect(topBarPill).toContainText('⌘K')

  // Global search (F10 CP4): the top bar is title · search · spacer ·
  // Ask Penny. Behavior lives in search.spec.ts; here just its presence.
  await expect(page.getByTestId('global-search')).toBeVisible()
})

test('⌘K summons Penny from anywhere; on her screen it focuses the composer, never navigates away', async ({
  page,
}) => {
  const email = uniqueEmail('shell-cmdk')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // The routes are code-split: the URL flips before the authed layout
  // mounts, and a ⌘K pressed into that gap hits no listener (CI's cold
  // vite loses this race every time). The pill's visibility is the mount
  // signal — only then is the key live.
  await expect(page.getByTestId('penny-pill')).toBeVisible()

  // From a working surface, ⌘K lands on Penny.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page).toHaveURL(/\/penny$/)
  await expect(page.getByRole('heading', { name: 'Penny' })).toBeVisible()

  // Already there, ⌘K is idempotent: same URL, composer focused.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page).toHaveURL(/\/penny$/)
  await expect(page.getByPlaceholder(/ask penny/i)).toBeFocused()

  // The pills navigate too, and the sidebar pill wears its active form on
  // the Penny screen (s22: penny border, "open · ⌘K").
  await expect(page.getByTestId('penny-pill')).toContainText('open · ⌘K')
  await page.goto('/dashboard')
  await page.getByTestId('ask-penny').click()
  await expect(page).toHaveURL(/\/penny$/)
  await page.goto('/dashboard')
  await page.getByTestId('penny-pill').click()
  await expect(page).toHaveURL(/\/penny$/)
})

test('navigation moves between surfaces and marks the active item', async ({
  page,
}) => {
  const email = uniqueEmail('shell-nav')
  // One account, so the Register shows its empty state — an EMPTY ledger
  // now mounts Onboarding instead (rehomed here by F10 CP1), which is that
  // surface's own spec.
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Accounts' }),
  ).toHaveAttribute('aria-current', 'page')

  // Register mounts with its designed empty state: the view tabs, the
  // ledger's column header (permanent list chrome, CP1) over an honest
  // "nothing yet".
  await primaryNav(page).getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Register' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()
  // The three views ride the tab row (F10 CP1); All is current by default.
  await expect(page.getByTestId('view-all')).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByTestId('view-review')).toBeVisible()
  await expect(page.getByTestId('view-uncategorized')).toBeVisible()
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
    primaryNav(page).getByRole('link', { name: 'Register' }),
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

  // Pin dark via the Profile menu (theme's F7 CP0 home) and confirm the
  // shell re-renders under .dark.
  await setTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(
    primaryNav(page).getByRole('link', { name: 'Register' }),
  ).toBeVisible()
})
