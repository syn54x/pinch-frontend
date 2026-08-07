import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// #63 (wireframe s7c 2b/2c + 8b), re-addressed by F10 CP1 (#87) onto the
// Register's To-review tab: reviewing never leaves the queue to grow the
// taxonomy — the picker's create row (always last), the inline sheet, and
// the Apply-to block with the retro-scope door.

async function seedUnreviewed(
  email: string,
  rows: Array<[string, number]>,
): Promise<void> {
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  for (const [index, [description, amount]] of rows.entries()) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: accounts.items[0].id,
        date: `2026-07-1${index}`,
        amount_minor: amount,
        description,
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
  }
  await ctx.dispose()
}

test('the picker creates a category inline — create row last, sheet prefilled, never leaves the queue', async ({
  page,
}) => {
  const email = uniqueEmail('inline-create')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])
  await seedUnreviewed(email, [['SUNRISE BAKERY', -1250]])

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Register' }).click()
  await page.getByTestId('view-review').click()
  await page
    .getByTestId('queue-row')
    .filter({ hasText: 'SUNRISE BAKERY' })
    .click()

  const inspector = page.getByTestId('reviewer-panel')
  await inspector.getByRole('button', { name: /Correct category/ }).click()
  const picker = page.getByTestId('category-picker')
  await picker.getByRole('combobox').fill('Bakeries')

  // The create row exists, and it is the LAST option — existing categories
  // win the ranking.
  const createRow = page.getByTestId('create-category-row')
  await expect(createRow).toContainText('＋ Create “Bakeries”')
  await expect(picker.getByRole('option').last()).toContainText('Create')

  await createRow.click()
  const sheet = page.getByTestId('create-category-sheet')
  await expect(sheet.getByLabel('Category name')).toHaveValue('Bakeries')
  // A guessed color is pre-selected; everything stays editable.
  await expect(
    sheet.getByRole('button', { pressed: true }).first(),
  ).toBeVisible()
  await sheet.getByLabel('Parent category').selectOption({
    label: 'Food & Drink',
  })
  await sheet.getByRole('button', { name: 'Create & assign' }).click()

  // Still in the queue: the new category is staged, Apply-to defaults to
  // just-this-transaction, and Accept files it.
  await expect(inspector.getByTestId('category-pill')).toContainText('Bakeries')
  const applyTo = inspector.getByTestId('apply-to')
  await expect(applyTo.getByLabel('Just this transaction')).toBeChecked()
  await inspector.getByRole('button', { name: 'Accept correction · A' }).click()
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'SUNRISE BAKERY' }),
  ).toHaveCount(0)

  // The category is real taxonomy, not a phantom: it lives in the tree.
  await page.goto('/categories')
  await expect(
    page.getByTestId('category-row').filter({ hasText: 'Bakeries' }),
  ).toBeVisible()
})

test('make-a-rule defaults to going-forward; the scope door escalates and applies to the backlog', async ({
  page,
}) => {
  const email = uniqueEmail('inline-rule')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])
  await seedUnreviewed(email, [
    ['MOSS FLORAL', -3200],
    ['MOSS FLORAL', -1800],
    ['MOSS FLORAL', -2400],
  ])

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Register' }).click()
  await page.getByTestId('view-review').click()
  await page
    .getByTestId('queue-row')
    .filter({ hasText: 'MOSS FLORAL' })
    .first()
    .click()

  const inspector = page.getByTestId('reviewer-panel')
  await inspector.getByRole('button', { name: /Correct category/ }).click()
  await page
    .getByTestId('category-picker')
    .getByRole('combobox')
    .fill('Florists')
  await page.getByTestId('create-category-row').click()
  await page
    .getByTestId('create-category-sheet')
    .getByRole('button', { name: 'Create & assign' })
    .click()

  // Make a rule: forward by default, and it says so plainly.
  const applyTo = inspector.getByTestId('apply-to')
  await applyTo.getByText('make a rule').click()
  await expect(inspector.getByTestId('rule-scope-summary')).toContainText(
    'Going forward only',
  )
  await expect(
    inspector.getByRole('button', { name: 'Accept & create rule · A' }),
  ).toBeVisible()

  // Change scope › — the same three-way tiers, the inspector's shorter door.
  await inspector.getByRole('button', { name: 'Change scope ›' }).click()
  const options = inspector.getByTestId('rule-scope-options')
  await options.getByText('still waiting to review').click()
  await inspector
    .getByRole('button', { name: 'Create rule & apply to 3 · A' })
    .click()

  // This row files; the two siblings re-propose under the rule.
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'MOSS FLORAL' }),
  ).toHaveCount(2, { timeout: 15_000 })
  const sibling = page
    .getByTestId('queue-row')
    .filter({ hasText: 'MOSS FLORAL' })
    .first()
  await expect(sibling.getByTestId('provenance-badge')).toHaveAttribute(
    'data-provenance',
    'rule',
    { timeout: 15_000 },
  )
  await expect(sibling.getByTestId('category-pill')).toContainText('Florists')

  // And the rule is real law, visible on the Rules tab.
  await page.goto('/categories/rules')
  await expect(
    page.getByTestId('rule-row').filter({ hasText: 'moss floral' }),
  ).toContainText('created by you')
})
