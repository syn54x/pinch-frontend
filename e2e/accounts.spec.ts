import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
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
