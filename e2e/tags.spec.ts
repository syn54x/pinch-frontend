import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F4 CP3 (#61, wireframe s20): tag totals, the detail pane, rename that
// fixes the label everywhere, CSV export, and detach-only delete.
test('tags carry totals, open to their rows, rename everywhere, export, and delete safely', async ({
  page,
}) => {
  const email = uniqueEmail('tags')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Checking', currency: 'USD' },
  ])

  // Seed tagged transactions over the API: two on #warehaus, one elsewhere.
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string }>
  }
  const accountId = accounts.items[0].id
  for (const [amount, description, tags] of [
    [-21480, 'COSTCO #482', ['warehaus']],
    [-6210, 'COSTCO GAS', ['warehaus']],
    [-3400, 'UBER TRIP', ['client-visit']],
  ] as const) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: accountId,
        date: '2026-07-15',
        amount_minor: amount,
        description,
        tags: [...tags],
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
  }
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/categories/tags')

  // Totals on the list: 214.80 + 62.10 = 276.90 across 2 transactions.
  const warehaus = page.getByTestId('tag-row').filter({ hasText: 'warehaus' })
  await expect(warehaus).toContainText('2 txns')
  await expect(warehaus).toContainText('$276.90')

  // Detail pane: the tagged rows, and the export downloads a CSV.
  await warehaus.click()
  const detail = page.getByTestId('tag-detail')
  await expect(detail.getByTestId('tag-txn')).toHaveCount(2)
  const downloadPromise = page.waitForEvent('download')
  await detail
    .getByRole('button', { name: 'Export for expense report' })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('warehaus.csv')

  // Rename collision is refused with the reason; a fresh name lands
  // everywhere at once.
  await detail.getByRole('button', { name: 'Rename' }).click()
  await detail.getByLabel('Tag name').fill('CLIENT-VISIT')
  await detail.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('tag-error')).toContainText(
    'A tag with that name exists',
  )
  await detail.getByLabel('Tag name').fill('warehouse-run')
  await detail.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByTestId('tag-row').filter({ hasText: 'warehouse-run' }),
  ).toContainText('2 txns')

  // Delete detaches: the tag disappears, the transactions stay put.
  await detail.getByRole('button', { name: 'Delete tag' }).click()
  await expect(
    page.getByTestId('tag-row').filter({ hasText: 'warehouse-run' }),
  ).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Register' })
    .click()
  await expect(page.getByText('COSTCO #482')).toBeVisible()
})
