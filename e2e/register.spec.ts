import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { dayHeading, daysAgo, RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F3 CP1 — the Register (wireframe #8): browse → filter → search → inspect
// → edit, against real seeded history. Seeding rides the manual-entry API
// (see helpers/register.ts for the review-state physics it leans on).

function rows(page: Page) {
  return page.getByTestId('txn-row')
}

function rowFor(page: Page, payee: string) {
  return rows(page).filter({ hasText: payee })
}

function inspector(page: Page) {
  return page.getByTestId('inspector')
}

async function openRegister(page: Page, email: string) {
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
}

test('date-grouped rows render payee, catpill, and signed amounts per the wireframe', async ({
  page,
}) => {
  const email = uniqueEmail('reg-browse')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'Whole Foods Market',
    category: 'Groceries',
  })
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: 420000,
    description: 'Payroll — Acme',
    category: 'Income',
  })
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -1549,
    description: 'Netflix',
    category: 'Subscriptions',
  })
  await seed.dispose()

  await openRegister(page, email)

  // Day groups, newest first, in the wireframe's heading voice.
  const list = page.getByTestId('register-list')
  await expect(list.getByText(dayHeading(0), { exact: true })).toBeVisible()
  await expect(list.getByText(dayHeading(1), { exact: true })).toBeVisible()

  // Payee + catpill (emoji + color) + tabular signed amount.
  const wholeFoods = rowFor(page, 'Whole Foods Market')
  await expect(wholeFoods.getByTestId('catpill')).toHaveText('🛒Groceries')
  await expect(wholeFoods.getByText('−$62.40')).toBeVisible()
  await expect(
    rowFor(page, 'Payroll — Acme').getByText('+$4,200.00'),
  ).toBeVisible()
  await expect(rowFor(page, 'Netflix').getByTestId('catpill')).toHaveText(
    '📺Subscriptions',
  )
})

test('the register holds in dark mode', async ({ page }) => {
  const email = uniqueEmail('reg-dark')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'Whole Foods Market',
    category: 'Groceries',
  })
  await seed.dispose()

  await openRegister(page, email)
  // Cycle system → light → dark via the shell toggle (the shell.spec move).
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  // The ledger vocabulary survives the theme: group heading, catpill, amount.
  await expect(
    page.getByTestId('register-list').getByText(dayHeading(0), { exact: true }),
  ).toBeVisible()
  const row = rowFor(page, 'Whole Foods Market')
  await expect(row.getByTestId('catpill')).toBeVisible()
  await expect(row.getByText('−$62.40')).toBeVisible()
})

test('cursor pagination streams a large history as the list scrolls', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('reg-pages')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  // 60 transactions over six days — one cursor page of 50 plus a remainder.
  for (let i = 0; i < 60; i++) {
    await seed.createTxn(checking, {
      date: daysAgo(1 + Math.floor(i / 10)),
      amountMinor: -100 - i,
      description: `Coffee run #${String(i + 1).padStart(2, '0')}`,
    })
  }
  await seed.dispose()

  await openRegister(page, email)
  await expect(rows(page)).toHaveCount(50)

  // Scrolling the sentinel into view pulls the next cursor page.
  await page.getByTestId('register-sentinel').scrollIntoViewIfNeeded()
  await expect(rows(page)).toHaveCount(60)
  await expect(page.getByTestId('register-sentinel')).toHaveCount(0)
})

test('filters compose: account × category × tag × date range', async ({
  page,
}) => {
  const email = uniqueEmail('reg-filters')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  await seed.createTxn(checking, {
    date: daysAgo(2),
    amountMinor: -1200,
    description: 'Blue Bottle',
    category: 'Coffee',
    tags: ['work'],
  })
  await seed.createTxn(checking, {
    date: daysAgo(2),
    amountMinor: -5000,
    description: 'Whole Foods Market',
    category: 'Groceries',
    tags: ['errands'],
  })
  await seed.createTxn(savings, {
    date: daysAgo(2),
    amountMinor: 123,
    description: 'Interest payment',
    category: 'Income',
  })
  // Outside every rolling window the date chip offers.
  await seed.createTxn(checking, {
    date: daysAgo(200),
    amountMinor: -900,
    description: 'Old Coffee',
    category: 'Coffee',
    tags: ['work'],
  })
  await seed.dispose()

  await openRegister(page, email)
  await expect(rows(page)).toHaveCount(4)

  // Account: savings-only rows drop.
  await page.getByTestId('chip-account').click()
  await page.getByRole('button', { name: /Chase Checking/ }).click()
  await expect(rows(page)).toHaveCount(3)
  await expect(rowFor(page, 'Interest payment')).toHaveCount(0)

  // × category: only the Coffee rows survive.
  await page.getByTestId('chip-category').click()
  await page.getByRole('button', { name: 'Coffee', exact: true }).click()
  await expect(rows(page)).toHaveCount(2)
  await expect(rowFor(page, 'Whole Foods Market')).toHaveCount(0)

  // × tag: both Coffee rows carry #work — the set holds.
  await page.getByTestId('chip-tag').click()
  await page.getByRole('button', { name: '#work' }).click()
  await expect(rows(page)).toHaveCount(2)

  // × date range: the 200-day-old row falls outside "Last 90 days".
  await page.getByTestId('chip-date').click()
  await page.getByRole('button', { name: 'Last 90 days' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rowFor(page, 'Blue Bottle')).toBeVisible()

  // Clear filters restores the full ledger.
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(rows(page)).toHaveCount(4)
})

test('text search reaches payee, display name, and notes', async ({ page }) => {
  const email = uniqueEmail('reg-search')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'WHOLEFDS #10234 AUSTIN TX',
  })
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -450,
    description: 'SQ *COFFEE CART',
    displayName: 'Morning coffee',
  })
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -3000,
    description: 'TARGET 00123',
    notes: 'supplies for the office party',
  })
  await seed.dispose()

  await openRegister(page, email)
  const searchBox = page.getByLabel('Search transactions')

  // Payee/description.
  await searchBox.fill('wholefds')
  await expect(rows(page)).toHaveCount(1)
  await expect(rowFor(page, 'WHOLEFDS #10234 AUSTIN TX')).toBeVisible()

  // Display name.
  await searchBox.fill('morning')
  await expect(rows(page)).toHaveCount(1)
  await expect(rowFor(page, 'Morning coffee')).toBeVisible()

  // Notes.
  await searchBox.fill('office party')
  await expect(rows(page)).toHaveCount(1)
  await expect(rowFor(page, 'TARGET 00123')).toBeVisible()

  // Nothing matches → the distinct no-matches state, with the way out.
  await searchBox.fill('zebra crossing')
  await expect(page.getByTestId('register-no-matches')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(rows(page)).toHaveCount(3)
})

test('the Inspector shows everything and edits every field in place', async ({
  page,
}) => {
  const email = uniqueEmail('reg-edit')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.categoryId('Dining') // in the picker before the page loads
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'WHOLEFDS #10234 AUSTIN TX',
    category: 'Groceries',
  })
  await seed.dispose()

  await openRegister(page, email)
  await rowFor(page, 'WHOLEFDS').getByRole('button').click()

  // The Inspector shows everything: raw description, account/status line,
  // amount, category.
  const pane = inspector(page)
  await expect(pane.getByText('WHOLEFDS #10234 AUSTIN TX')).toBeVisible()
  await expect(pane.getByText(/Chase Checking/)).toBeVisible()
  await expect(pane.getByText(/posted/)).toBeVisible()
  await expect(pane.getByText('−$62.40')).toBeVisible()
  await expect(pane.getByTestId('catpill')).toHaveText('🛒Groceries')

  // Category edits in place — and the row reflects it immediately.
  await pane.getByTestId('chip-set-category').click()
  await page.getByRole('button', { name: 'Dining' }).click()
  await expect(pane.getByTestId('catpill')).toHaveText('🍽️Dining')
  await expect(rowFor(page, 'WHOLEFDS').getByTestId('catpill')).toHaveText(
    '🍽️Dining',
  )

  // Tags: add via the chip input.
  await pane.getByLabel('Add tag').fill('warehouse-run')
  await pane.getByLabel('Add tag').press('Enter')
  await expect(pane.getByTestId('tag-chip')).toHaveText(/#warehouse-run/)

  // Display name: an override — the row's payee follows.
  await pane.getByRole('button', { name: 'Edit display name' }).click()
  await pane.getByLabel('Display name').fill('Whole Foods Market')
  await pane.getByLabel('Display name').press('Enter')
  await expect(
    pane.getByRole('heading', { name: 'Whole Foods Market' }),
  ).toBeVisible()
  await expect(rowFor(page, 'Whole Foods Market')).toHaveCount(1)
  // The raw description stays visible — an override, never a copy.
  await expect(pane.getByText('WHOLEFDS #10234 AUSTIN TX')).toBeVisible()

  // Notes save on blur.
  await pane.getByLabel('Notes').fill('stocking up for the month')
  await pane.getByLabel('Notes').blur()

  // Everything persisted: a full reload replays the same truth (selection
  // rides the URL).
  await page.reload()
  const reloaded = inspector(page)
  await expect(
    reloaded.getByRole('heading', { name: 'Whole Foods Market' }),
  ).toBeVisible()
  await expect(reloaded.getByTestId('catpill')).toHaveText('🍽️Dining')
  await expect(reloaded.getByTestId('tag-chip')).toHaveText(/#warehouse-run/)
  await expect(reloaded.getByLabel('Notes')).toHaveValue(
    'stocking up for the month',
  )

  // Remove the tag — the set patches back down.
  await reloaded
    .getByRole('button', { name: 'Remove tag warehouse-run' })
    .click()
  await expect(reloaded.getByTestId('tag-chip')).toHaveCount(0)
})

test('transfers and splits are visibly marked; unreviewed rows route to the Inbox', async ({
  page,
}) => {
  const email = uniqueEmail('reg-marks')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')

  // A linked transfer: opposite legs on different accounts.
  const outflow = await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -12000,
    description: 'Venmo → Alex',
  })
  const inflow = await seed.createTxn(savings, {
    date: daysAgo(0),
    amountMinor: 12000,
    description: 'Venmo from Chase',
  })
  await seed.createTransfer(outflow, inflow)

  // A split: two categorized lines summing to the parent.
  const costco = await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -21490,
    description: 'Costco',
    category: 'Shopping',
  })
  await seed.putSplits(costco, [
    { amountMinor: -18000, category: 'Groceries' },
    { amountMinor: -3490, category: 'Home', memo: 'shelving' },
  ])

  // An untouched incoming transaction: unreviewed by construction.
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -999,
    description: 'Mystery Charge',
  })
  await seed.dispose()

  await openRegister(page, email)

  // Transfer rows: marked, excluded from spending, no catpill.
  const venmo = rowFor(page, 'Venmo → Alex')
  await expect(venmo.getByText('transfer', { exact: true })).toBeVisible()
  await expect(venmo.getByTestId('catpill')).toHaveCount(0)
  await venmo.getByRole('button').click()
  await expect(
    inspector(page).getByText('Transfer — excluded from spending'),
  ).toBeVisible()

  // Split rows: line count on the row, lines in the Inspector.
  const costcoRow = rowFor(page, 'Costco')
  await expect(costcoRow.getByText('2 splits')).toBeVisible()
  await costcoRow.getByRole('button').click()
  await expect(inspector(page).getByText('Split · 2 lines')).toBeVisible()
  await expect(inspector(page).getByText('shelving')).toBeVisible()
  await expect(inspector(page).getByText('−$180.00')).toBeVisible()

  // Unreviewed rows offer a route to the Inbox — a link, never an accept
  // button (review verbs live there).
  const mystery = rowFor(page, 'Mystery Charge')
  await mystery.getByRole('button').click()
  await expect(
    inspector(page).getByTestId('inspector-inbox-link'),
  ).toBeVisible()
  await expect(
    inspector(page).getByRole('button', { name: /Accept/ }),
  ).toHaveCount(0)
  await mystery.getByTestId('row-unreviewed-link').click()
  await expect(page).toHaveURL(/\/inbox$/)
})
