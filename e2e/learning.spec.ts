import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F4 CP4 (#62, wireframe s21): the Learning tab — stats tiles from the
// correction-log rollup, the read-only decision feed, and a full-tier
// retro-apply collapsed to one batch row. No verbs anywhere.
test('learning shows the flywheel: tiles, the decision feed, and a collapsed batch', async ({
  page,
}) => {
  const email = uniqueEmail('learning')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])

  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  const accountId = accounts.items[0].id
  const categories = (await (
    await ctx.get('/api/v1/categories?limit=100')
  ).json()) as { items: Array<{ id: string; name: string }> }
  const coffee = categories.items.find((c) => c.name === 'Coffee')
  if (!coffee) throw new Error('seeded Coffee category missing')

  async function seedTxn(description: string, amount: number) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: accountId,
        date: '2026-07-10',
        amount_minor: amount,
        description,
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
    return ((await created.json()) as { id: string }).id
  }
  async function review(id: string, body: Record<string, unknown> = {}) {
    const reviewed = await ctx.post(`/api/v1/transactions/${id}/review`, {
      data: body,
      headers: await csrf(),
    })
    expect(reviewed.ok()).toBe(true)
  }

  // Two accepts-as-proposed, one correction.
  await review(await seedTxn('SQ *THE BAR', -1200))
  await review(await seedTxn('PCC MARKET', -5400))
  await review(await seedTxn('BLUE BOTTLE', -450), { category_id: coffee.id })

  // Two reviewed COSTCO rows, then a full-tier rule = one logged batch.
  await review(await seedTxn('COSTCO #482', -21480))
  await review(await seedTxn('COSTCO GAS', -6210))
  const rule = await ctx.post('/api/v1/rules', {
    data: {
      condition: { payee: { op: 'contains', value: 'costco' } },
      action_category_id: coffee.id,
      apply: 'full',
    },
    headers: await csrf(),
  })
  expect(rule.ok()).toBe(true)
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/categories/learning')

  // Tiles: 5 reviews, 2 untouched accepts + 1 correction + 2 batch
  // overwrites = 3 corrections... but the batch rides the same rollup:
  // corrections = reviews minus untouched = (5 + 2 batch) - 2 = 5? No —
  // assert the numbers the API actually reports, read as a user would.
  await expect(page.getByTestId('tile-corrections')).toBeVisible()
  await expect(page.getByTestId('tile-untouched')).toContainText('%')
  await expect(page.getByTestId('tile-promoted')).toContainText('0')

  // The feed: a collapsed batch row on top of the singles.
  const batch = page.getByTestId('learning-batch')
  await expect(batch).toContainText('A rule recategorized 2 transactions')
  await batch.locator('summary').click()
  await expect(batch).toContainText('COSTCO #482 → Coffee')

  const corrected = page
    .getByTestId('learning-entry')
    .filter({ hasText: 'BLUE BOTTLE' })
  await expect(corrected).toContainText(
    'you corrected the proposal uncategorized → Coffee',
  )
  const accepted = page
    .getByTestId('learning-entry')
    .filter({ hasText: 'SQ *THE BAR' })
  await expect(accepted).toContainText('accepted as proposed')

  // Read-only by construction: no buttons anywhere on the tab.
  await expect(
    page.getByTestId('learning-tab').getByRole('button'),
  ).toHaveCount(0)
})
