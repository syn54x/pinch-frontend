import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { daysAgo } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F5 CP2 (#29, wireframe s11/s11e): Net Worth. Seeding is real balance history
// through the API — backdated balance-entries build the trend, and the client's
// two gates (projection ≥14 days of span; MoM needs a full prior month) are
// asserted from both sides. Charts assert at the accessibility seam + testids,
// never screenshots; contrast runs in both themes. Money is exact under en-US.

type Csrf = () => Promise<Record<string, string>>

async function createAccount(
  ctx: APIRequestContext,
  csrf: Csrf,
  label: string,
  kind: 'depository' | 'loan',
): Promise<string> {
  const res = await ctx.post('/api/v1/accounts', {
    data: { kind, label, currency: 'USD' },
    headers: await csrf(),
  })
  if (!res.ok()) throw new Error(`account failed: ${res.status()}`)
  return ((await res.json()) as { id: string }).id
}

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

interface Seeded {
  netWorth: number
  assets: number
  liabilities: number
  earliest: string
}

/** Seed `days`+1 daily balance points on a checking (asset) and a loan
 * (liability): checking rises, the loan pays down. Returns the as-of totals so
 * money asserts stay exact. */
async function seedNetWorth(email: string, days: number): Promise<Seeded> {
  await seedUser(email, PASSWORD)
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  try {
    const checking = await createAccount(
      ctx,
      csrf,
      'E2E Checking',
      'depository',
    )
    const loan = await createAccount(ctx, csrf, 'E2E Auto Loan', 'loan')
    for (let d = days; d >= 0; d--) {
      const t = days - d
      await backdateBalance(
        ctx,
        csrf,
        checking,
        1_000_000 + t * 50_000,
        `${daysAgo(d)}T12:00:00Z`,
      )
      await backdateBalance(
        ctx,
        csrf,
        loan,
        -800_000 + t * 10_000,
        `${daysAgo(d)}T12:00:00Z`,
      )
    }
    const checkingNow = 1_000_000 + days * 50_000
    const loanNow = -800_000 + days * 10_000
    return {
      netWorth: checkingNow + loanNow,
      assets: checkingNow,
      liabilities: loanNow,
      earliest: daysAgo(days),
    }
  } finally {
    await ctx.dispose()
  }
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
function money(minor: number): string {
  return usd.format(minor / 100)
}

function monthStartISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

async function openNetWorth(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Net Worth' }).click()
  await expect(page).toHaveURL(/\/net-worth/)
  await expect(page.getByTestId('nw-hero')).toBeVisible({ timeout: 15_000 })
}

test('projection + MoM ready: exact totals, dashed line past the now-divider, range deep-links', async ({
  page,
}) => {
  const email = uniqueEmail('nw-ready')
  // 40 days > any day-of-month, so history is guaranteed to reach a prior
  // month (MoM ready) and to span ≥14 days (projection ready).
  const seeded = await seedNetWorth(email, 40)
  await openNetWorth(page, email)

  await expect(page.getByTestId('nw-hero')).toHaveText(money(seeded.netWorth))
  // Scope to the tiles: with one asset + one loan the totals equal the single
  // account balances, which also appear in the by-account rows.
  const tiles = page.getByTestId('nw-tiles')
  await expect(
    tiles.getByText(money(seeded.assets), { exact: true }),
  ).toBeVisible()
  await expect(
    tiles.getByText(money(seeded.liabilities), { exact: true }),
  ).toBeVisible()

  // Projection is shown (divider present, s11e card absent).
  await expect(page.getByTestId('nw-now-divider')).toBeVisible()
  await expect(page.getByTestId('nw-projection-not-ready')).toHaveCount(0)

  // MoM ready → the tile shows a value, not the "needs a full month" gate.
  await expect(page.getByText('needs a full month')).toHaveCount(0)

  // The chart's accessible seam + the by-account rows.
  await expect(page.getByTestId('chart-data-table')).toBeAttached()
  await expect(page.getByTestId('nw-account-row')).toHaveCount(2)

  // Range lives in the URL and is a deep-link.
  await page.getByRole('button', { name: '1M' }).click()
  await expect(page).toHaveURL(/range=1m/)
  await expect(page.getByRole('button', { name: '1M' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('range deep-link restores from the URL on load', async ({ page }) => {
  const email = uniqueEmail('nw-deeplink')
  await seedNetWorth(email, 40)
  await loginViaUi(page, email, PASSWORD)
  // Wait for the authed shell before a hard navigation — the login redirect is
  // still settling when loginViaUi returns.
  await expect(page.getByRole('link', { name: 'Net Worth' })).toBeVisible()
  await page.goto('/net-worth?range=all')
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('nw-hero')).toBeVisible()
})

test('early history: the honest s11e state — no projection', async ({
  page,
}) => {
  const email = uniqueEmail('nw-early')
  const seeded = await seedNetWorth(email, 3)
  await openNetWorth(page, email)

  // The projection gate is closed: the "not ready" card, no dashed line/divider.
  await expect(page.getByTestId('nw-projection-not-ready')).toBeVisible()
  await expect(page.getByTestId('nw-now-divider')).toHaveCount(0)

  // Balances are still real from day one.
  await expect(page.getByTestId('nw-hero')).toHaveText(money(seeded.netWorth))
})

test('MoM gate: all-range on a within-month history reads "—", not a fabricated change', async ({
  page,
}) => {
  const email = uniqueEmail('nw-mom')
  // range=all starts the series at the first observation; a few days of history
  // this month means no full prior month to compare against.
  const seeded = await seedNetWorth(email, 3)
  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByRole('link', { name: 'Net Worth' })).toBeVisible()
  await page.goto('/net-worth?range=all')
  await expect(page.getByTestId('nw-hero')).toBeVisible()

  // Deterministic except within the first days of a month (when 3 days ago fell
  // in the prior month and the gate legitimately opens) — assert whichever the
  // gate should show for this run date.
  if (seeded.earliest > monthStartISO()) {
    await expect(page.getByText('needs a full month')).toBeVisible()
  } else {
    await expect(page.getByText('needs a full month')).toHaveCount(0)
  }
})

test('net worth holds AA contrast in both themes', async ({ page }) => {
  const email = uniqueEmail('nw-contrast')
  await seedNetWorth(email, 40)
  await openNetWorth(page, email)

  async function assertContrast() {
    for (const locator of [
      page.getByTestId('nw-hero'),
      page.getByText('By account'),
      page.getByTestId('nw-account-row').first(),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }

  // Whichever theme we start in, then the other.
  await assertContrast()
  const toggle = page.getByRole('button', { name: /Switch to (light|dark)/ })
  await toggle.click()
  await assertContrast()
})
