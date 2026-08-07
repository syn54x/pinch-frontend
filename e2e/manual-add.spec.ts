import { expect, type Locator, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { attachAccountsToConnection, stageConnection } from './helpers/db'
import { pollUnreviewed } from './helpers/detection'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F10 CP5 (#91, wireframe s10/2b): + Add on the Register — manual
// transaction entry, and the account-derived Manual badge. Review-state
// physics under test are the backend's own (create_transaction): with a
// category the row is reviewed at birth and never queues; bare, it stays
// unreviewed and the classify pipeline attaches Penny's proposal.
//
// "To-review" is the Register's own tab since F10 CP1 (#87) — the queue
// assertions below land there.

function rows(page: Page) {
  return page.getByTestId('txn-row')
}

function rowFor(page: Page, payee: string) {
  return rows(page).filter({ hasText: payee })
}

async function openRegister(page: Page, email: string) {
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
}

async function openAddDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New transaction' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('categorized manual add skips review and wears the Manual badge', async ({
  page,
}) => {
  const email = uniqueEmail('manual-cat')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  await seed.createAccount('Cash Wallet')
  // A seeder-created category (no default-taxonomy name collision).
  await seed.categoryId('E2E Market')
  await seed.dispose()

  await openRegister(page, email)
  const dialog = await openAddDialog(page)

  // The direction selector offers Expense and Income only — Transfer was
  // cut from + Add (PRD #79): a manual transfer stays add-two-then-press-T.
  const direction = dialog.getByRole('group', { name: 'Direction' })
  await expect(direction.getByRole('button', { name: 'Expense' })).toBeVisible()
  await expect(direction.getByRole('button', { name: 'Income' })).toBeVisible()
  await expect(direction.getByRole('button', { name: 'Transfer' })).toHaveCount(
    0,
  )

  // Account defaults to the one manual account; Expense is the default sign.
  await expect(dialog.getByLabel('Account', { exact: true })).toHaveValue(/./)
  await dialog.getByLabel('Payee').fill('Farmers market')
  await dialog.getByLabel('Amount').fill('24.00')
  await dialog.getByLabel('Category').selectOption({ label: 'E2E Market' })
  await expect(dialog.getByText('Skips review')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()

  // The row lands categorized, negative, and wearing the Manual badge.
  const row = rowFor(page, 'Farmers market')
  await expect(row.getByTestId('catpill')).toHaveText(/E2E Market/)
  await expect(row.getByText('−$24.00')).toBeVisible()
  await expect(row.getByTestId('row-manual')).toBeVisible()

  // Reviewed at birth: no unreviewed mark, and the review count never
  // lights up (the badge renders only when the count is nonzero).
  await expect(row.getByTestId('row-unreviewed-link')).toHaveCount(0)
  await expect(page.getByTestId('review-count')).toHaveCount(0)
})

test('uncategorized manual add queues for review with a proposal attached', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const email = uniqueEmail('manual-queue')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  await seed.createAccount('Cash Wallet')
  await seed.dispose()

  await openRegister(page, email)
  const dialog = await openAddDialog(page)

  await dialog.getByLabel('Payee').fill('Paycheck')
  await dialog.getByLabel('Amount').fill('150')
  await dialog.getByRole('button', { name: 'Income' }).click()
  // No category picked — the form says where the row is headed.
  await expect(dialog.getByText('Lands in review')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()

  // Income is a positive amount; the row arrives unreviewed, and the live
  // count follows without a reload.
  const row = rowFor(page, 'Paycheck')
  await expect(row.getByText('+$150.00')).toBeVisible()
  await expect(row.getByTestId('row-unreviewed-link')).toBeVisible()
  await expect(page.getByTestId('review-count')).toHaveText('1')

  // The classify pipeline (async worker) attaches Penny's proposal.
  await pollUnreviewed(
    email,
    PASSWORD,
    (items) =>
      items.some(
        (item) => item.description_raw === 'Paycheck' && item.proposal !== null,
      ),
    'a proposal on the manual add',
  )

  // And the row is waiting in the To-review tab's queue.
  await page.getByTestId('view-review').click()
  await expect(page).toHaveURL(/\/register\?view=review$/)
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'Paycheck' }),
  ).toBeVisible()
})

test('an empty account picker offers inline manual-account creation', async ({
  page,
}) => {
  const email = uniqueEmail('manual-first')
  await seedUser(email, PASSWORD)
  // A staged connection keeps the first-run wizard (which now lives on the
  // Register, F10 CP1) out of the way: the ledger has a connection but no
  // manual account — exactly the "+ Add with an empty picker" case.
  await stageConnection(email, {
    provider: 'plaid',
    institutionName: 'E2E Bank',
  })

  await openRegister(page, email)
  const dialog = await openAddDialog(page)

  // No manual accounts yet — not a dead end: the form offers creating one.
  await dialog.getByLabel('Account name').fill('Cash Wallet')
  await dialog.getByRole('button', { name: 'Create account' }).click()

  // The transaction form appears with the new account selected.
  const account = dialog.getByLabel('Account', { exact: true })
  await expect(account).toBeVisible()
  await expect(
    account.getByRole('option', { name: 'Cash Wallet' }),
  ).toHaveCount(1)
  await dialog.getByLabel('Payee').fill('Food truck')
  await dialog.getByLabel('Amount').fill('12.50')
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()

  const row = rowFor(page, 'Food truck')
  await expect(row.getByText('−$12.50')).toBeVisible()
  await expect(row.getByTestId('row-manual')).toBeVisible()
})

test('synced rows never wear the Manual badge', async ({ page }) => {
  const email = uniqueEmail('manual-synced')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -450,
    description: 'Coffee Shop',
    category: 'E2E Cafe',
  })
  await seed.dispose()
  // Hermetic "synced" staging (the db.ts precedent): a staged connection
  // plus re-parenting the account onto it — `manual` is derived
  // (connection_id IS NULL), and the real path needs Plaid credentials
  // the local stack no longer has (production cutover).
  await stageConnection(email, {
    provider: 'plaid',
    institutionName: 'E2E Bank',
  })
  await attachAccountsToConnection(email)

  await openRegister(page, email)
  const row = rowFor(page, 'Coffee Shop')
  await expect(row.getByText('−$4.50')).toBeVisible()
  await expect(page.getByTestId('row-manual')).toHaveCount(0)
})
