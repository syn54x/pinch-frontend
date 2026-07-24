import { expect, type Page, test } from '@playwright/test'
import type { RecurringSeriesOut } from '../src/api/generated/types.gen'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F5 CP3 (#30, wireframe s12): Recurring. Detection is real-pipeline only — no
// manual series creation — so seeding is 4 same-payee monthly transactions and a
// wait for the async classify worker to spot the pattern (the same seam
// detection.ts uses for transfers). Then the curation round-trip and the one-way
// dismiss go straight through the API; charts assert at the a11y seam, contrast
// in both themes. Cycle-state rendering is covered exhaustively by the unit test.

/** Same day-of-month N months back (day ≤ 28 so it exists every month) — a
 * clean monthly cadence the detector recognizes. */
function monthlyDate(monthsBack: number): string {
  const now = new Date()
  const day = Math.min(now.getDate(), 28)
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, day)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

async function pollRecurring(
  email: string,
  match: RegExp,
  timeoutMs = 90_000,
): Promise<RecurringSeriesOut[]> {
  const { ctx } = await authedContext(email, PASSWORD)
  try {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const response = await ctx.get('/api/v1/recurring?limit=100')
      if (response.ok()) {
        const { items } = (await response.json()) as {
          items: RecurringSeriesOut[]
        }
        if (
          items.some((s) => match.test(s.payee) || match.test(s.display_name))
        )
          return items
      }
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for recurring detection')
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  } finally {
    await ctx.dispose()
  }
}

/** Seed one detected Netflix series (4 monthly charges → the worker detects it).
 * It lands as a `bill` (outflow default) with no category (Uncategorized). */
async function seedRecurring(email: string): Promise<void> {
  await seedUser(email, PASSWORD)
  const seeder = await RegisterSeeder.login(email, PASSWORD)
  const account = await seeder.createAccount('E2E Checking', 'depository')
  for (const monthsBack of [3, 2, 1, 0]) {
    await seeder.createTxn(account, {
      date: monthlyDate(monthsBack),
      amountMinor: -1549,
      description: 'NETFLIX.COM',
    })
  }
  await seeder.dispose()
  await pollRecurring(email, /netflix/i)
}

async function openRecurring(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Recurring' }).click()
  await expect(page).toHaveURL(/\/recurring/)
  await expect(page.getByTestId('recurring-row').first()).toBeVisible({
    timeout: 15_000,
  })
}

test('a detected series surfaces with the tiles, donut, and cycle list', async ({
  page,
}) => {
  const email = uniqueEmail('rec-list')
  await seedRecurring(email)
  await openRecurring(page, email)

  await expect(page.getByTestId('recurring-row')).toHaveCount(1)
  await expect(page.getByTestId('recurring-row')).toContainText(/netflix/i)
  // Tiles render real money (the $15.49/mo bill).
  await expect(page.getByTestId('recurring-tiles')).toContainText('$15.49')
  // The donut exposes its data at the accessibility seam.
  await expect(page.getByTestId('chart-data-table')).toBeAttached()
})

test('curate: rename and flip kind round-trip through the API', async ({
  page,
}) => {
  const email = uniqueEmail('rec-curate')
  await seedRecurring(email)
  await openRecurring(page, email)

  await page.getByTestId('recurring-row').click()
  const drawer = page.getByTestId('curation-drawer')
  await expect(drawer).toBeVisible()

  // Rename → PATCH display_name → the list row reflects it.
  await page.getByLabel('Display name').fill('My Netflix')
  await drawer.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByTestId('recurring-row')).toContainText('My Netflix')

  // Flip Bill → Subscription → PATCH kind → the segmented reflects the refetch.
  await drawer.getByRole('button', { name: 'Subscription' }).click()
  await expect(
    drawer.getByRole('button', { name: 'Subscription' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('dismiss is one-way: the series leaves and the totals fall to the empty state', async ({
  page,
}) => {
  const email = uniqueEmail('rec-dismiss')
  await seedRecurring(email)
  await openRecurring(page, email)

  await page.getByTestId('recurring-row').click()
  await page.getByRole('button', { name: 'Dismiss — stop tracking' }).click()
  // The confirm spells out the one-way, non-destructive contract.
  await expect(page.getByText(/won't be suggested again/i)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()

  // The only series is gone; the report total invalidates to zero → s12e.
  await expect(page.getByTestId('recurring-empty')).toBeVisible({
    timeout: 15_000,
  })
})

test('recurring holds AA contrast in both themes', async ({ page }) => {
  const email = uniqueEmail('rec-contrast')
  await seedRecurring(email)
  await openRecurring(page, email)

  async function assertContrast() {
    for (const locator of [
      page.getByTestId('recurring-row').first(),
      page.getByText('This cycle'),
      page.getByTestId('recurring-tiles').getByText('Monthly recurring'),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }

  await assertContrast()
  await page.getByRole('button', { name: /Switch to (light|dark)/ }).click()
  await assertContrast()
})
