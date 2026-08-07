import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { daysAgo, RegisterSeeder } from './helpers/register'
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

test('the nav is exactly Dashboard, Register, Recurring, Accounts, Categories & Rules, Connections — no Setup label — and Penny is reachable from every screen', async ({
  page,
}) => {
  const email = uniqueEmail('shell-lean')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Exactly these destinations, in the wireframe's final order (F10 CP3,
  // #89) — no disabled items, no stubs, no "Setup" grouping. Penny is
  // deliberately NOT a nav item: she has her own pill.
  await expect(primaryNav(page).getByRole('link')).toHaveText([
    'Dashboard',
    // The Inbox left with F10 CP1 (#87, ADR 0002): review is the
    // Register's To-review view, and the count pill rides Register.
    'Register',
    // Net Worth left with F10 CP2 (#88): absorbed into Accounts.
    'Recurring',
    'Accounts',
    'Categories & Rules', // F4 CP0 (#58); F10 CP3 moved it ahead of Connections
    'Connections',
  ])
  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('Setup')).toHaveCount(0) // the label is gone
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
  await expect(
    primaryNav(page).getByRole('link', { name: 'Categories & Rules' }),
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

test('the live unreviewed-count pill rides the Register nav item (F10 CP3)', async ({
  page,
}) => {
  const email = uniqueEmail('shell-review-count')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  // Untouched incoming transaction: unreviewed by construction.
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -999,
    description: 'Mystery Charge',
  })
  await seed.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await expect(page.getByTestId('review-count')).toHaveText('1')
  // The e2e gotcha: the accessible name becomes "Register 1" once the pill
  // shows — scope to Primary, never `exact: true` for this link.
  await expect(
    primaryNav(page).getByRole('link', { name: 'Register 1' }),
  ).toBeVisible()
})

test('Your money groups the ledger by kind with real per-account and group totals, consistent with the Accounts page (F10 CP3)', async ({
  page,
}) => {
  const email = uniqueEmail('shell-your-money')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Chase Checking',
      currency: 'USD',
      balanceMinor: 12_430_00,
    },
    {
      kind: 'depository',
      label: 'Ally Savings',
      currency: 'USD',
      balanceMinor: 5_970_00,
    },
    {
      kind: 'investment',
      label: 'Fidelity Brokerage',
      currency: 'USD',
      balanceMinor: 198_200_00,
    },
    { kind: 'asset', label: 'Home', currency: 'USD', balanceMinor: 115_000_00 },
    { kind: 'credit', label: 'Visa', currency: 'USD', balanceMinor: -2_800_00 },
    {
      kind: 'loan',
      label: 'Auto Loan',
      currency: 'USD',
      balanceMinor: -28_400_00,
    },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('Your money')).toBeVisible()

  // Group totals: real primary-currency sums, kind → group per the PRD
  // (depository → Cash, investment → Investments, asset → Property, credit
  // + loan → Debt).
  await expect(page.getByTestId('sidebar-group-cash-total')).toHaveText(
    '$18,400.00',
  )
  await expect(page.getByTestId('sidebar-group-investments-total')).toHaveText(
    '$198,200.00',
  )
  await expect(page.getByTestId('sidebar-group-property-total')).toHaveText(
    '$115,000.00',
  )
  await expect(page.getByTestId('sidebar-group-debt-total')).toHaveText(
    '-$31,200.00',
  )

  // Per-account rows render inside their group, ARIA-labelled.
  const cashGroup = page.getByRole('group', { name: 'Cash accounts' })
  await expect(cashGroup.getByText('Chase Checking')).toBeVisible()
  await expect(cashGroup.getByText('$12,430.00')).toBeVisible()
  const debtGroup = page.getByRole('group', { name: 'Debt accounts' })
  await expect(debtGroup.getByText('Auto Loan')).toBeVisible()
  await expect(debtGroup.getByText('-$28,400.00')).toBeVisible()

  // Consistent with the Accounts page's own hero number — both read the
  // same net-worth report. 18,400 + 198,200 + 115,000 − 31,200 = 300,400.
  await expect(page.getByTestId('nw-hero')).toHaveText('$300,400.00')
})

test('an account the report cannot convert renders in its group at its native balance, outside the group total (F10 CP3)', async ({
  page,
}) => {
  const email = uniqueEmail('shell-your-money-excluded')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Chase Checking',
      currency: 'USD',
      balanceMinor: 5_000_00,
    },
    // v0's FX is same-currency-only (fx.py) — a non-primary currency has no
    // rate, so the net-worth report excludes it from `accounts`/the total,
    // even though the plain account roster still knows it exists.
    {
      kind: 'depository',
      label: 'Paris Account',
      currency: 'EUR',
      balanceMinor: 200_00,
    },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await expect(page.getByTestId('sidebar-group-cash-total')).toHaveText(
    '$5,000.00',
  )
  const cashGroup = page.getByRole('group', { name: 'Cash accounts' })
  await expect(cashGroup.getByText('Paris Account')).toBeVisible()
  await expect(cashGroup.getByText('€200.00')).toBeVisible()
})

test('Your money groups collapse/expand, the total stays visible collapsed, and the state survives reload (F10 CP3)', async ({
  page,
}) => {
  const email = uniqueEmail('shell-your-money-collapse')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Chase Checking',
      currency: 'USD',
      balanceMinor: 1_000_00,
    },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  const trigger = page.getByTestId('sidebar-group-cash')
  const sidebar = page.locator('aside')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(sidebar.getByText('Chase Checking')).toBeVisible()

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(sidebar.getByText('Chase Checking')).toBeHidden()
  // The total keeps showing while collapsed.
  await expect(page.getByTestId('sidebar-group-cash-total')).toHaveText(
    '$1,000.00',
  )

  // Collapse state is per device (localStorage) — it survives a reload.
  await page.reload()
  await expect(page.getByTestId('sidebar-group-cash')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(page.getByTestId('sidebar-group-cash-total')).toHaveText(
    '$1,000.00',
  )
})

test('the Penny pill and profile row stay pinned to the bottom regardless of how many accounts fill Your money (F10 CP3)', async ({
  page,
}) => {
  const email = uniqueEmail('shell-your-money-pinned')
  const many = Array.from({ length: 25 }, (_, i) => ({
    kind: 'depository' as const,
    label: `Account ${i + 1}`,
    currency: 'USD',
    balanceMinor: 1_00,
  }))
  await seedUser(email, PASSWORD, many)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // The nav (brand row excluded) overflows and scrolls internally...
  const nav = primaryNav(page)
  await expect(page.getByTestId('sidebar-group-cash-total')).toBeVisible()
  const [scrollHeight, clientHeight] = await nav.evaluate((el) => [
    el.scrollHeight,
    el.clientHeight,
  ])
  expect(scrollHeight).toBeGreaterThan(clientHeight)

  // ...while the Penny pill and the user row stay put, visible without the
  // page itself needing to scroll.
  await expect(page.getByTestId('penny-pill')).toBeVisible()
  await expect(page.locator('aside').getByText(email)).toBeVisible()
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
