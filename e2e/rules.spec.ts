import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F4 CP2 (#60, wireframes s17b/s19/s19b): the Rules tab and builder —
// authoring with evidence, the retro-apply tiers, and Penny's suggested
// rules finally reaching consent.

test('authoring a rule with apply-to-unreviewed refreshes the backlog with rule provenance', async ({
  page,
}) => {
  const email = uniqueEmail('rules-apply')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])

  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  const category = await ctx.post('/api/v1/categories', {
    data: { name: 'Warehouse Runs', emoji: '📦' },
    headers: await csrf(),
  })
  expect(category.ok()).toBe(true)
  for (const [amount, description] of [
    [-21480, 'COSTCO #482'],
    [-6210, 'COSTCO GAS'],
  ] as const) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: accounts.items[0].id,
        date: '2026-07-15',
        amount_minor: amount,
        description,
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
  }
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/categories/rules')
  await page.getByRole('link', { name: 'New rule' }).click()
  await expect(page).toHaveURL(/\/categories\/rules\/new$/)

  await page.getByLabel('Payee value').fill('COSTCO')
  await page
    .getByLabel('Set category')
    .selectOption({ label: '📦 Warehouse Runs' })

  // The preview is evidence with the consent breakdown, and the default
  // tier's verb names its consequence.
  await expect(page.getByTestId('rule-preview')).toContainText('2 unreviewed')
  await page.getByRole('button', { name: 'Create rule & apply to 2' }).click()

  // Back on the list: the law, annotated.
  const row = page.getByTestId('rule-row').filter({ hasText: 'costco' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('created by you')

  // The vacated backlog re-proposes under the rule (the worker sweeps);
  // the Inbox rows wear the rule's category and provenance.
  await page.getByRole('link', { name: 'Inbox' }).click()
  const inboxRow = page
    .getByTestId('inbox-row')
    .filter({ hasText: 'COSTCO #482' })
  await expect(inboxRow.getByTestId('category-pill')).toContainText(
    'Warehouse Runs',
    { timeout: 15_000 },
  )
  await expect(inboxRow.getByTestId('provenance-badge')).toHaveAttribute(
    'data-provenance',
    'rule',
  )
})

test('a suggested rule is accepted through the builder and another dismisses for good', async ({
  page,
}) => {
  const email = uniqueEmail('rules-suggest')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])

  // Three consistent filings of one payee mint a suggested rule at the
  // third review (promotion is synchronous with review).
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  const categories = (await (
    await ctx.get('/api/v1/categories?limit=100')
  ).json()) as { items: Array<{ id: string; name: string }> }
  const coffee = categories.items.find((c) => c.name === 'Coffee')
  if (!coffee) throw new Error('seeded Coffee category missing')

  for (const payee of ['BLUE BOTTLE', 'EQUINOX CLUB']) {
    for (let index = 0; index < 3; index += 1) {
      const created = await ctx.post('/api/v1/transactions', {
        data: {
          account_id: accounts.items[0].id,
          date: `2026-07-0${index + 1}`,
          amount_minor: -450 - index,
          description: payee,
        },
        headers: await csrf(),
      })
      expect(created.ok()).toBe(true)
      const { id } = (await created.json()) as { id: string }
      const reviewed = await ctx.post(`/api/v1/transactions/${id}/review`, {
        data: { category_id: coffee.id },
        headers: await csrf(),
      })
      expect(reviewed.ok()).toBe(true)
    }
  }
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/categories/rules')

  // Two suggestion cards. Accept the first through the builder…
  const cards = page.getByTestId('suggested-rule')
  await expect(cards).toHaveCount(2)
  await cards
    .filter({ hasText: 'blue bottle' })
    .getByRole('link', { name: 'Create rule' })
    .click()
  await expect(page.getByRole('heading', { name: 'Create rule' })).toBeVisible()
  await expect(page.getByLabel('Payee value')).toHaveValue('blue bottle')
  await expect(page.getByTestId('apply-tiers')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create rule' }).click()
  const accepted = page
    .getByTestId('rule-row')
    .filter({ hasText: 'blue bottle' })
  await expect(accepted).toBeVisible()
  await expect(accepted).toContainText('promoted from history')

  // …and dismiss the second: a tombstone, gone from the surface.
  await cards
    .filter({ hasText: 'equinox' })
    .getByRole('button', { name: 'Dismiss' })
    .click()
  await expect(page.getByTestId('suggested-rule')).toHaveCount(0)
})
