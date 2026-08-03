import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F4 CP1 (#59, wireframes s17/s18): the Categories tab — tree with
// identity and rolled-up spend, the identity dialog, the guarded delete —
// and identity carried into the Register's catpills.
test('a category is born with identity, shows its spend, and carries into the Register', async ({
  page,
}) => {
  const email = uniqueEmail('cats-tree')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Categories & Rules' }).click()

  // Create Coffee with identity: ☕ + the teal slot.
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('Name').fill('Matcha Fund')
  await page.getByLabel('Emoji').fill('☕')
  await page.getByRole('button', { name: 'Color teal' }).click()
  await page.getByRole('button', { name: 'Create category' }).click()
  const row = page
    .getByTestId('category-row')
    .filter({ hasText: 'Matcha Fund' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('☕')

  // Seed a categorized transaction this month over the API, then the tree
  // shows its rolled-up spend and the Register wears the chosen identity.
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  const categories = (await (
    await ctx.get('/api/v1/categories?limit=100')
  ).json()) as { items: Array<{ id: string; name: string }> }
  const coffee = categories.items.find((c) => c.name === 'Matcha Fund')
  if (!coffee) throw new Error('Matcha Fund category missing')
  const today = new Date().toISOString().slice(0, 10)
  const txn = await ctx.post('/api/v1/transactions', {
    data: {
      account_id: accounts.items[0].id,
      date: today,
      amount_minor: -450,
      description: 'BLUE BOTTLE',
      category_id: coffee.id,
    },
    headers: await csrf(),
  })
  expect(txn.ok()).toBe(true)
  await ctx.dispose()

  await page.reload()
  await expect(
    page.getByTestId('category-row').filter({ hasText: 'Matcha Fund' }),
  ).toContainText('$4.50')

  await page.getByRole('link', { name: 'Register', exact: true }).click()
  const pill = page.getByTestId('catpill').filter({ hasText: 'Matcha Fund' })
  await expect(pill.first()).toBeVisible()
  await expect(pill.first()).toContainText('☕')
})

test('editing identity propagates and the delete is guarded', async ({
  page,
}) => {
  const email = uniqueEmail('cats-guard')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/categories')

  // Parent + child, then deleting the parent is refused with the reason.
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('Name').fill('Hobby Farm')
  await page.getByRole('button', { name: 'Color violet' }).click()
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(
    page.getByTestId('category-row').filter({ hasText: 'Hobby Farm' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('Name').fill('Chickens')
  await page.getByLabel('Parent').selectOption({ label: 'Hobby Farm' })
  // Children default to the family color — inherited on parent pick,
  // still overridable.
  await expect(
    page.getByRole('button', { name: 'Color violet' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Create category' }).click()
  const child = page.getByTestId('category-row').filter({ hasText: 'Chickens' })
  await expect(child).toBeVisible()

  const parentRow = page
    .getByTestId('category-row')
    .filter({ hasText: 'Hobby Farm' })
    .first()
  await parentRow.hover()
  await parentRow.getByRole('button', { name: 'Delete Hobby Farm' }).click()
  await page.getByRole('button', { name: 'Delete category' }).click()
  await expect(page.getByTestId('delete-category-error')).toContainText(
    "Move or delete this category's children first",
  )
  await page.keyboard.press('Escape')

  // Edit the child's identity; the row updates without reload.
  await child.hover()
  await child.getByRole('button', { name: 'Edit Chickens' }).click()
  await page.getByLabel('Emoji').fill('🛒')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByTestId('category-row').filter({ hasText: 'Chickens' }),
  ).toContainText('🛒')

  // The child deletes cleanly with the uncategorized disposition.
  await child.hover()
  await child.getByRole('button', { name: 'Delete Chickens' }).click()
  await page.getByRole('button', { name: 'Delete category' }).click()
  await expect(
    page.getByTestId('category-row').filter({ hasText: 'Chickens' }),
  ).toHaveCount(0)
})
