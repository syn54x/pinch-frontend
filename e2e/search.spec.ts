import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// Global search v1 (F10 CP4, #90): the top-bar combobox matches account
// names client-side, and both result kinds land on the Register — an
// account pick as its account filter, "Search transactions" as its
// free-text filter. `/` focuses the field; ⌘K stays Penny's.

function searchField(page: Page) {
  return page.getByTestId('global-search')
}

function results(page: Page) {
  return page.getByTestId('global-search-results')
}

function rows(page: Page) {
  return page.getByTestId('txn-row')
}

/** Two accounts with disjoint activity, so filter landings are provable. */
async function seedLedger(email: string) {
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'Whole Foods Market',
    category: 'Groceries',
  })
  await seed.createTxn(savings, {
    date: daysAgo(1),
    amountMinor: 1200,
    description: 'Interest Payment',
    category: 'Income',
  })
  await seed.dispose()
}

test('picking an account lands on the Register filtered to that account', async ({
  page,
}) => {
  const email = uniqueEmail('search-account')
  await seedLedger(email)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // A proper combobox: collapsed at rest, expanded once queried.
  const field = searchField(page)
  await expect(field).toHaveRole('combobox')
  await expect(field).toHaveAttribute('aria-expanded', 'false')

  await field.click()
  await field.fill('chase')
  await expect(field).toHaveAttribute('aria-expanded', 'true')

  // Accounts first, then the deep-search action as the catch-all row.
  const options = results(page).getByRole('option')
  await expect(options).toHaveText([
    'Chase Checking',
    'Search transactions for “chase”',
  ])

  // Enter takes the highlighted first option — the account.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/register\?.*account=/)

  // The Register holds the filter: Chase activity only, chip labeled.
  await expect(rows(page)).toHaveText([/Whole Foods Market/])
  await expect(page.getByTestId('chip-account')).toContainText('Chase Checking')

  // The field reset after landing.
  await expect(field).toHaveValue('')
})

test('the "search transactions" action lands on the Register with the free-text filter', async ({
  page,
}) => {
  const email = uniqueEmail('search-txns')
  await seedLedger(email)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  const field = searchField(page)
  await field.click()
  await field.fill('interest')

  // No account is named "interest" — deep search is the only row.
  await results(page)
    .getByRole('option', { name: 'Search transactions for “interest”' })
    .click()

  await expect(page).toHaveURL(/\/register\?.*q=interest/)
  await expect(rows(page)).toHaveText([/Interest Payment/])
  // The Register's own search box carries the text on.
  await expect(page.getByLabel('Search transactions')).toHaveValue('interest')
})

test('/ focuses the field from anywhere in the shell; ⌘K stays Penny and typing elsewhere keeps its slashes', async ({
  page,
}) => {
  const email = uniqueEmail('search-slash')
  await seedLedger(email)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // The shell must be mounted before the key is live (the shell.spec ⌘K
  // race note applies here too).
  await expect(page.getByTestId('penny-pill')).toBeVisible()

  await page.keyboard.press('/')
  await expect(searchField(page)).toBeFocused()
  // The slash focused, it didn't type.
  await expect(searchField(page)).toHaveValue('')

  // Escape closes the list, a second Escape releases focus.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(searchField(page)).not.toBeFocused()

  // ⌘K is untouched: still Penny's summon, even from the search flow.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page).toHaveURL(/\/penny$/)

  // A slash typed into another editing surface stays a slash — the
  // Penny composer keeps it, the search field stays unfocused.
  const composer = page.getByPlaceholder(/ask penny/i)
  await composer.click()
  await composer.pressSequentially('a/b')
  await expect(composer).toHaveValue('a/b')
  await expect(searchField(page)).not.toBeFocused()
})
