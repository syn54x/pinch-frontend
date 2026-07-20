import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

function cardFor(page: Page, label: string) {
  return page.getByTestId('account-card').filter({ hasText: label })
}

test('accounts render as cards with kind badges and formatted balances', async ({
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

  const checking = cardFor(page, 'Everyday Checking')
  await expect(checking.getByText('depository')).toBeVisible()
  await expect(checking.getByText('$1,234.56')).toBeVisible()

  const travel = cardFor(page, 'Travel Card')
  await expect(travel.getByText('credit')).toBeVisible()
  await expect(travel.getByText('-$500.00')).toBeVisible()
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
