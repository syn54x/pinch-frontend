import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F5 CP5 (#32, wireframe s6/s6b/s6e): the Dashboard, the new home. Seeding is
// real through the API — backdated balances build the net-worth trend, and bare
// manual transactions (created without a category → unreviewed at birth) fill
// the To-review queue. The unreviewed COUNT is seeded-known and exact; charts
// assert at the accessibility seam, never screenshots; contrast runs in both
// themes.

type Csrf = () => Promise<Record<string, string>>

async function backdateBalance(
  ctx: APIRequestContext,
  csrf: Csrf,
  accountId: string,
  amountMinor: number,
  asOf: string,
): Promise<void> {
  const res = await ctx.post(`/api/v1/accounts/${accountId}/balance-entries`, {
    data: { amount_minor: amountMinor, as_of: asOf },
    headers: await csrf(),
  })
  if (!res.ok())
    throw new Error(`balance failed: ${res.status()} ${await res.text()}`)
}

/** Seed an account with 20 days of rising balance history, then `bare`
 * descriptions as unreviewed transactions across the given day offsets. */
async function seedDashboard(
  email: string,
  bare: { days: number; description: string }[],
): Promise<void> {
  await seedUser(email, PASSWORD)
  const seeder = await RegisterSeeder.login(email, PASSWORD)
  try {
    const account = await seeder.createAccount('E2E Checking', 'depository')
    const { ctx, csrf } = await authedContext(email, PASSWORD)
    try {
      for (let d = 20; d >= 0; d--) {
        await backdateBalance(
          ctx,
          csrf,
          account,
          1_000_000 + (20 - d) * 20_000,
          `${daysAgo(d)}T12:00:00Z`,
        )
      }
    } finally {
      await ctx.dispose()
    }
    // Bare (no category) → unreviewed at birth; money out builds spending.
    for (const txn of bare) {
      await seeder.createTxn(account, {
        date: daysAgo(txn.days),
        amountMinor: -4_200,
        description: txn.description,
      })
    }
  } finally {
    await seeder.dispose()
  }
}

async function openDashboard(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible({ timeout: 15_000 })
}

test('populated dashboard: greeting, review CTA, tiles, net-worth card, day-pager', async ({
  page,
}) => {
  const email = uniqueEmail('dash-full')
  await seedDashboard(email, [
    { days: 0, description: 'Alpha Market' },
    { days: 0, description: 'Bravo Cafe' },
    { days: 1, description: 'Charlie Fuel' },
  ])
  await openDashboard(page, email)

  // Greeting + the review CTA carries the real unreviewed count.
  const cta = page.getByTestId('dashboard-review-cta')
  await expect(cta).toContainText('Review 3 transactions')

  // Net-worth mini-card: hero + the chart's accessible seam; the local range
  // dropdown re-renders without touching the URL.
  await expect(page.getByTestId('dashboard-nw-hero')).toBeVisible()
  await expect(page.getByTestId('chart-data-table')).toBeAttached()
  await page.getByLabel('Net worth range').selectOption('1m')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByTestId('dashboard-nw-hero')).toBeVisible()

  // Penny's read teaser is present but inert (no pulse, "Coming soon").
  await expect(page.getByTestId('dashboard-penny-read')).toContainText(
    'Coming soon',
  )

  // To-review tile shows the count.
  await expect(page.getByTestId('tile-to-review')).toContainText('3')

  // Day-pager starts on today (2 rows), pages to yesterday (1 row).
  await expect(page.getByTestId('to-review-day')).toContainText('Today')
  await expect(page.getByTestId('to-review-left')).toHaveText('3 left')
  await expect(page.getByTestId('to-review-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByTestId('to-review-day')).toContainText('Yesterday')
  await expect(page.getByTestId('to-review-row')).toHaveCount(1)
})

test('inline ✓ and Accept-day clear the queue and decrement the To-review tile', async ({
  page,
}) => {
  const email = uniqueEmail('dash-accept')
  await seedDashboard(email, [
    { days: 0, description: 'Alpha Market' },
    { days: 0, description: 'Bravo Cafe' },
    { days: 1, description: 'Charlie Fuel' },
  ])
  await openDashboard(page, email)

  await expect(page.getByTestId('tile-to-review')).toContainText('3')

  // Inline ✓ on one of today's rows: the tile and "left" both drop (the
  // accept invalidates the ledger stats the tile reads).
  await page
    .getByTestId('to-review-row')
    .filter({ hasText: 'Alpha Market' })
    .getByRole('button', { name: /Accept Alpha Market/ })
    .click()
  await expect(page.getByTestId('to-review-left')).toHaveText('2 left')
  await expect(page.getByTestId('tile-to-review')).toContainText('2')

  // Accept day (the remaining today row) → the pager falls to yesterday.
  await page.getByRole('button', { name: 'Accept day · A' }).click()
  await expect(page.getByTestId('to-review-left')).toHaveText('1 left')
  await expect(page.getByTestId('to-review-day')).toContainText('Yesterday')
})

test('Fix drawer walks the queue across a day boundary and Esc returns focus', async ({
  page,
}) => {
  const email = uniqueEmail('dash-fix')
  // One transaction per day so the queue order is unambiguous: today's Alpha
  // then yesterday's Charlie.
  await seedDashboard(email, [
    { days: 0, description: 'Alpha Market' },
    { days: 1, description: 'Charlie Fuel' },
  ])
  await openDashboard(page, email)

  const alphaRow = page
    .getByTestId('to-review-row')
    .filter({ hasText: 'Alpha Market' })
  const fixAlpha = alphaRow.getByRole('button', { name: 'Fix' })

  // Open Fix on today's row: "1 of 2", inspecting Alpha, day = Today.
  await fixAlpha.click()
  const drawer = page.getByTestId('fix-drawer')
  await expect(drawer).toBeVisible()
  await expect(page.getByTestId('fix-drawer-position')).toHaveText('1 of 2')
  await expect(drawer).toContainText('Alpha Market')
  await expect(page.getByTestId('to-review-day')).toContainText('Today')

  // Esc closes and returns focus to the origin row's Fix button.
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(fixAlpha).toBeFocused()

  // Re-open and Accept: the row leaves, focus advances to yesterday's Charlie,
  // the queue renumbers ("1 of 1"), and the day pane behind the scrim syncs.
  await fixAlpha.click()
  await expect(page.getByTestId('fix-drawer-position')).toHaveText('1 of 2')
  await drawer.getByRole('button', { name: /Accept/ }).click()
  await expect(drawer).toContainText('Charlie Fuel')
  await expect(page.getByTestId('fix-drawer-position')).toHaveText('1 of 1')
  await expect(page.getByTestId('to-review-day')).toContainText('Yesterday')
})

test('empty ledger lands on the s6e connect state, not a wall of zeros', async ({
  page,
}) => {
  const email = uniqueEmail('dash-empty')
  await seedUser(email, PASSWORD) // no accounts, no connections
  await openDashboardEmpty(page, email)

  const empty = page.getByTestId('dashboard-empty')
  await expect(empty).toContainText('Welcome to Pinch')
  await expect(empty).toContainText('Connect your first account')
  await expect(page.getByTestId('dashboard-empty-connect')).toBeVisible()
  // No stat tiles, no wall of zeros.
  await expect(page.getByTestId('dashboard-tiles')).toHaveCount(0)
})

async function openDashboardEmpty(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByTestId('dashboard-empty')).toBeVisible({
    timeout: 15_000,
  })
}

test('the dashboard holds AA contrast in both themes', async ({ page }) => {
  const email = uniqueEmail('dash-contrast')
  await seedDashboard(email, [
    { days: 0, description: 'Alpha Market' },
    { days: 1, description: 'Charlie Fuel' },
  ])
  await openDashboard(page, email)

  async function assertContrast() {
    for (const locator of [
      page.getByRole('heading', {
        name: /Good (morning|afternoon|evening)/,
      }),
      page.getByTestId('dashboard-nw-hero'),
      page.getByTestId('tile-to-review'),
      page.getByTestId('to-review-day'),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }

  await assertContrast()
  await page.getByRole('button', { name: /Switch to (light|dark)/ }).click()
  await assertContrast()
})
