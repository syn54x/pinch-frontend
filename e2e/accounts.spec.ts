import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { daysAgo } from './helpers/register'
import { loginViaUi, toggleTheme } from './helpers/ui'

// F10 CP2 (#88, wireframes 1l/4f/3b): Accounts absorbs Net Worth. One page —
// the Net worth / Assets vs debts tabs over the chart (both URL-backed, with
// the range chips), the grouped account list beneath, and the always-visible
// archive/delete rail. The old Net Worth specs live here now: seeding is real
// balance history through the API, charts assert at the accessibility seam +
// testids (never screenshots), and money is exact under en-US.

function cardFor(page: Page, label: string) {
  return page.getByTestId('account-card').filter({ hasText: label })
}

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

/** Seed balance history over `days` on a checking (asset) and a loan
 * (liability): checking rises, the loan pays down. `step` thins the points —
 * the span (last − first), not the density, is what the gates read. Returns
 * the as-of totals so money asserts stay exact. */
async function seedNetWorth(
  email: string,
  days: number,
  step = 1,
): Promise<Seeded> {
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
    const points = [...Array(Math.ceil(days / step)).keys()]
      .map((i) => days - i * step)
      .concat([0])
    for (const d of points) {
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

async function openAccounts(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Accounts', exact: true }).click()
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByTestId('nw-hero')).toBeVisible({ timeout: 15_000 })
}

test('accounts group by category with subtotals under the net-worth hero, with the debt link and a hover-free rail', async ({
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

  // The hero is the net worth: 1,234.56 − 500.00 = 734.56.
  await expect(page.getByTestId('nw-hero')).toHaveText('$734.56')
  await expect(page.getByText('2 accounts', { exact: true })).toBeVisible()

  // Grouped into Cash and Liabilities, each with its section header.
  await expect(page.getByRole('heading', { name: /Cash/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Liabilities/ })).toBeVisible()

  // Balances land in the right rows.
  await expect(
    cardFor(page, 'Everyday Checking').getByText('$1,234.56'),
  ).toBeVisible()
  await expect(cardFor(page, 'Travel Card').getByText('-$500.00')).toBeVisible()

  // The archive rail is always visible — no hover discovery (F10 CP2).
  await expect(
    cardFor(page, 'Everyday Checking').getByRole('button', {
      name: 'Archive Everyday Checking',
    }),
  ).toBeVisible()

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

test('archive is one-way from the app: account leaves the hero and groups, keeps its history section', async ({
  page,
}) => {
  const email = uniqueEmail('archive')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Everyday Checking',
      currency: 'USD',
      balanceMinor: 100000,
    },
    {
      kind: 'depository',
      label: 'Old Stash Duplicate',
      currency: 'USD',
      balanceMinor: 25000,
    },
  ])

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByTestId('nw-hero')).toHaveText('$1,250.00')

  // No hover needed — the rail is always visible.
  await cardFor(page, 'Old Stash Duplicate')
    .getByRole('button', { name: 'Archive Old Stash Duplicate' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Archive Old Stash Duplicate?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Archive account' }).click()

  // Out of the hero (the report excludes archived) and the groups; into the
  // dimmed Archived section.
  await expect(page.getByTestId('nw-hero')).toHaveText('$1,000.00')
  await expect(page.getByText('1 account', { exact: true })).toBeVisible()
  const archivedSection = page.getByTestId('archived-section')
  await expect(archivedSection).toContainText('Old Stash Duplicate')
  // No archive verb on an already-archived row — one-way, no re-offer.
  await expect(
    archivedSection.getByRole('button', { name: /Archive/ }),
  ).toHaveCount(0)
})

test('hard delete states the toll and takes the history with it', async ({
  page,
}) => {
  const email = uniqueEmail('hard-delete')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Keeper Checking',
      currency: 'USD',
      balanceMinor: 100000,
    },
    {
      kind: 'depository',
      label: 'Stash Debris',
      currency: 'USD',
      balanceMinor: 5000,
    },
  ])
  // Two transactions on the doomed account, one reviewed.
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  const accounts = (await (await ctx.get('/api/v1/accounts')).json()) as {
    items: Array<{ id: string; label: string }>
  }
  const debris = accounts.items.find((a) => a.label === 'Stash Debris')
  if (!debris) throw new Error('seed missing')
  for (const [amount, description] of [
    [-4500, 'BLUE BOTTLE'],
    [-1200, 'SNACK CART'],
  ] as const) {
    const created = await ctx.post('/api/v1/transactions', {
      data: {
        account_id: debris.id,
        date: '2026-07-15',
        amount_minor: amount,
        description,
      },
      headers: await csrf(),
    })
    expect(created.ok()).toBe(true)
    if (description === 'BLUE BOTTLE') {
      const { id } = (await created.json()) as { id: string }
      const reviewed = await ctx.post(`/api/v1/transactions/${id}/review`, {
        data: {},
        headers: await csrf(),
      })
      expect(reviewed.ok()).toBe(true)
    }
  }
  await ctx.dispose()

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // No hover needed — the rail is always visible.
  await cardFor(page, 'Stash Debris')
    .getByRole('button', { name: 'Delete Stash Debris' })
    .click()

  // The consent counts, before the irreversible click.
  await expect(page.getByTestId('delete-account-consent')).toContainText(
    'Permanently deletes 2 transactions (1 reviewed)',
  )
  await page.getByRole('button', { name: 'Delete account & data' }).click()

  await expect(cardFor(page, 'Stash Debris')).toHaveCount(0)
  await expect(page.getByText('1 account', { exact: true })).toBeVisible()

  // The history went with it — the Register no longer knows the payee.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Register' })
    .click()
  await expect(page.getByText('BLUE BOTTLE')).toHaveCount(0)
})

test('net worth tab, history ready: exact totals, projection past the now-divider; assets vs debts derives both lines', async ({
  page,
}) => {
  const email = uniqueEmail('nw-ready')
  // 75 days: past the 60-day collecting gate, past any month boundary, and
  // far past the 14-day projection gate. Thinned to every 5th day — the
  // gates read the span, not the density.
  const seeded = await seedNetWorth(email, 75, 5)
  await openAccounts(page, email)

  // The Net worth tab is the default and carries the exact as-of total.
  await expect(
    page.getByRole('tab', { name: 'Net worth', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('nw-hero')).toHaveText(money(seeded.netWorth))

  // Projection is shown (divider present); no collecting state at 75 days.
  await expect(page.getByTestId('nw-now-divider')).toBeVisible()
  await expect(page.getByTestId('nw-collecting')).toHaveCount(0)

  // The chart's accessible seam.
  await expect(page.getByTestId('chart-data-table')).toBeAttached()

  // Range lives in the URL and is a deep-link.
  await page.getByRole('button', { name: '1M' }).click()
  await expect(page).toHaveURL(/range=1m/)
  await expect(page.getByRole('button', { name: '1M' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // The Assets vs debts tab: URL-backed, both lines client-derived from the
  // report — the legend carries the exact current absolutes.
  await page.getByRole('tab', { name: 'Assets vs debts' }).click()
  await expect(page).toHaveURL(/tab=assets-debts/)
  await expect(
    page.getByRole('tab', { name: 'Assets vs debts' }),
  ).toHaveAttribute('aria-selected', 'true')
  const legend = page.getByTestId('avd-legend')
  await expect(
    legend.getByText(money(seeded.assets), { exact: true }),
  ).toBeVisible()
  await expect(
    legend.getByText(money(seeded.liabilities), { exact: true }),
  ).toBeVisible()
  // Indexed to the range start: the accessible table says what the lines are.
  await expect(page.getByTestId('chart-data-table')).toBeAttached()
  await expect(page.getByText('Assets change')).toBeAttached()
  await expect(
    page.getByText(/indexed to the start of the range/),
  ).toBeVisible()

  // The grouped account list stays beneath the card on both tabs.
  await expect(cardFor(page, 'E2E Checking')).toBeVisible()
  await expect(cardFor(page, 'E2E Auto Loan')).toBeVisible()
})

test('tab and range deep-links restore from the URL on load', async ({
  page,
}) => {
  const email = uniqueEmail('nw-deeplink')
  await seedNetWorth(email, 3)
  await loginViaUi(page, email, PASSWORD)
  // Wait for the authed shell before a hard navigation — the login redirect
  // is still settling when loginViaUi returns.
  await expect(page.getByTestId('nw-hero')).toBeVisible({ timeout: 15_000 })
  await page.goto('/accounts?tab=assets-debts&range=all')
  await expect(
    page.getByRole('tab', { name: 'Assets vs debts' }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('nw-hero')).toBeVisible()
})

test('early history: the honest 3b collecting state — compressed history, no projection', async ({
  page,
}) => {
  const email = uniqueEmail('nw-early')
  const seeded = await seedNetWorth(email, 3)
  await openAccounts(page, email)

  // The collecting state, not a dressed-up chart: the span chip, the honest
  // empty region, and the first-sync marker. No projection machinery. The
  // chip counts observed *buckets* (6m buckets weekly), so a 3-day seed reads
  // as the first day/days — assert the voice, not a bucket-dependent number.
  await expect(page.getByTestId('nw-collecting')).toBeVisible()
  await expect(page.getByTestId('nw-history-span')).toContainText('of history')
  await expect(page.getByText('no history before you connected')).toBeVisible()
  await expect(page.getByTestId('nw-first-sync')).toContainText('first sync')
  await expect(page.getByTestId('nw-now-divider')).toHaveCount(0)

  // Balances are still real from day one.
  await expect(page.getByTestId('nw-hero')).toHaveText(money(seeded.netWorth))
})

test('/net-worth is a permanent redirect into Accounts, range carried over', async ({
  page,
}) => {
  const email = uniqueEmail('nw-redirect')
  await seedUser(email, PASSWORD, [
    {
      kind: 'depository',
      label: 'Everyday Checking',
      currency: 'USD',
      balanceMinor: 100000,
    },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByTestId('nw-hero')).toBeVisible({ timeout: 15_000 })

  await page.goto('/net-worth')
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/net-worth?range=1m')
  await expect(page).toHaveURL(/\/accounts\?range=1m/)
  await expect(page.getByRole('button', { name: '1M' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('accounts holds AA contrast in both themes', async ({ page }) => {
  const email = uniqueEmail('nw-contrast')
  await seedNetWorth(email, 3)
  await openAccounts(page, email)

  async function assertContrast() {
    for (const locator of [
      page.getByTestId('nw-hero'),
      page.getByRole('heading', { name: /Cash/ }),
      page.getByTestId('account-card').first(),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }

  // Whichever theme we start in, then the other.
  await assertContrast()
  await toggleTheme(page)
  await assertContrast()
})
