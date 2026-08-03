import { expect, type Page, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

function cardFor(page: Page, label: string) {
  return page.getByTestId('account-card').filter({ hasText: label })
}

test('accounts group by category with subtotals, a running total, and the debt link', async ({
  page,
}) => {
  const email = uniqueEmail('cards')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Everyday Checking',
      currency: 'USD',
      balanceMinor: 123456,
    },
    {
      kind: 'credit',
      label: 'Travel Card',
      currency: 'USD',
      balanceMinor: -50000,
    },
  ])

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Running total: 1,234.56 − 500.00 = 734.56.
  await expect(page.getByText('Total across 2 accounts')).toBeVisible()
  await expect(page.getByText('$734.56')).toBeVisible()

  // Grouped into Cash and Liabilities, each with its section header.
  await expect(page.getByRole('heading', { name: /Cash/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Liabilities/ })).toBeVisible()

  // Balances land in the right rows.
  await expect(
    cardFor(page, 'Everyday Checking').getByText('$1,234.56'),
  ).toBeVisible()
  await expect(cardFor(page, 'Travel Card').getByText('-$500.00')).toBeVisible()

  // The Liabilities section opens the Debt view.
  await expect(page.getByRole('link', { name: /Debt view/ })).toBeVisible()
})

test('an account without a balance says so instead of showing zero', async ({
  page,
}) => {
  const email = uniqueEmail('nobalance')
  await seedUser(email, PASSWORD, [
    { kind: 'asset', label: 'House', currency: 'USD' },
  ])

  await loginViaUi(page, email, PASSWORD)
  await expect(cardFor(page, 'House').getByText('No balance yet')).toBeVisible()
})

test('a fresh user sees the honest empty state', async ({ page }) => {
  const email = uniqueEmail('empty')
  await seedUser(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByText(/No accounts yet/)).toBeVisible()
  await expect(page.getByText(/CLI/)).toBeVisible()
})

test('archive is one-way from the app: account leaves the total, keeps its history section', async ({
  page,
}) => {
  const email = uniqueEmail('archive')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Everyday Checking',
      currency: 'USD',
      balanceMinor: 100000,
    },
    {
      kind: 'depository',
      label: 'Old Stash Duplicate',
      currency: 'USD',
      balanceMinor: 25000,
    },
  ])

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Total across 2 accounts')).toBeVisible()
  await expect(page.getByText('$1,250.00').first()).toBeVisible()

  const stale = cardFor(page, 'Old Stash Duplicate')
  await stale.hover()
  await stale
    .getByRole('button', { name: 'Archive Old Stash Duplicate' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Archive Old Stash Duplicate?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Archive account' }).click()

  // Out of the total and the groups; into the dimmed Archived section.
  await expect(page.getByText('Total across 1 accounts')).toBeVisible()
  await expect(page.getByText('$1,000.00').first()).toBeVisible()
  const archivedSection = page.getByTestId('archived-section')
  await expect(archivedSection).toContainText('Old Stash Duplicate')
  // No archive verb on an already-archived row — one-way, no re-offer.
  await expect(
    archivedSection.getByRole('button', { name: /Archive/ }),
  ).toHaveCount(0)
})

test('hard delete states the toll and takes the history with it', async ({
  page,
}) => {
  const email = uniqueEmail('hard-delete')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Keeper Checking',
      currency: 'USD',
      balanceMinor: 100000,
    },
    {
      kind: 'depository',
      label: 'Stash Debris',
      currency: 'USD',
      balanceMinor: 5000,
    },
  ])
  // Two transactions on the doomed account, one reviewed.
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string; label: string }>
  }
  const debris = accounts.items.find((a) => a.label === 'Stash Debris')
  if (!debris) throw new Error('seed missing')
  for (const [amount, description] of [
    [-4500, 'BLUE BOTTLE'],
    [-1200, 'SNACK CART'],
  ] as const) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: debris.id,
        date: '2026-07-15',
        amount_minor: amount,
        description,
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
    if (description === 'BLUE BOTTLE') {
      const { id } = (await created.json()) as { id: string }
      const reviewed = await ctx.post(`/api/v1/transactions/${id}/review`, {
        data: {},
        headers: await csrf(),
      })
      expect(reviewed.ok()).toBe(true)
    }
  }
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  const row = cardFor(page, 'Stash Debris')
  await row.hover()
  await row.getByRole('button', { name: 'Delete Stash Debris' }).click()

  // The consent counts, before the irreversible click.
  await expect(page.getByTestId('delete-account-consent')).toContainText(
    'Permanently deletes 2 transactions (1 reviewed)',
  )
  await page.getByRole('button', { name: 'Delete account & data' }).click()

  await expect(cardFor(page, 'Stash Debris')).toHaveCount(0)
  await expect(page.getByText('Total across 1 accounts')).toBeVisible()

  // The history went with it — the Register no longer knows the payee.
  await page.getByRole('link', { name: 'Register', exact: true }).click()
  await expect(page.getByText('BLUE BOTTLE')).toHaveCount(0)
})
