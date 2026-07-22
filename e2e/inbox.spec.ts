import { expect, type Page, test } from '@playwright/test'
import { API, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { seedSandboxConnection, waitForFirstSync } from './helpers/plaid'
import {
  createCategory,
  createPayeeRule,
  reviewOneViaApi,
  stageAiProposal,
} from './helpers/seed'
import { loginViaUi } from './helpers/ui'

// F3 CP2 (#18, wireframe #7): the Inbox's core review loop. Seeding is the
// honest seam: a fake-bank (Plaid sandbox) connect → sync runs the real
// pipeline, so provenance is genuine — `rule` from a pre-created rule
// matching the sandbox's Uber transactions, `none` from the sweep's
// abstention. Only `ai` (unreachable in v0 — the classifier abstains) is
// DB-staged, per the helpers/db.ts precedent.

// Distinct from the ~40 default categories a signup seeds (e.g.
// "Transportation", "Rideshare") so exact-name lookups never collide.
const CATEGORY = 'E2E Transport'

function rows(page: Page) {
  return page.getByTestId('inbox-row')
}

function badge(page: Page) {
  return page.getByTestId('inbox-count')
}

function focusedRow(page: Page) {
  return page.locator('[data-testid="inbox-row"][aria-selected="true"]')
}

/** Category + rule BEFORE the connection so the first sync's pipeline
 * classifies with the rule; then one `ai` proposal staged on top. */
async function seedInbox(email: string): Promise<void> {
  await seedUser(email, PASSWORD)
  const categoryId = await createCategory(email, PASSWORD, CATEGORY)
  await createPayeeRule(email, PASSWORD, { contains: 'uber', categoryId })
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)
  await stageAiProposal(email, CATEGORY)
}

async function openInbox(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page).toHaveURL(/\/inbox$/)
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 })
}

test('keyboard-only pass: J/K/A/C clear the inbox, count live throughout', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const email = uniqueEmail('inbox-kbd')
  await seedInbox(email)
  await openInbox(page, email)

  // Day groups with the wireframe's label voice; the legend shows the core
  // verbs and nothing cut (no E, no CP3 verbs yet).
  await expect(page.getByTestId('inbox-day').first()).toBeVisible()
  const legend = page.getByTestId('inbox-legend')
  await expect(legend).toContainText('move')
  await expect(legend).toContainText('accept')
  await expect(legend).toContainText('category')
  await expect(legend).not.toContainText('explain')
  await expect(legend).not.toContainText('split')

  // The nav badge and the header count agree with reviewed=false reality.
  const total = await rows(page).count()
  expect(total).toBeGreaterThan(2)
  await expect(badge(page)).toHaveText(String(total))
  await expect(page.getByTestId('inbox-to-review')).toHaveText(
    `${total} to review`,
  )

  // Real pipeline provenance (rule from the pre-created rule, — from the
  // sweep) plus the one staged ai; uncategorized is a legitimate state,
  // never an error.
  await expect(page.locator('[data-provenance="rule"]').first()).toBeVisible()
  await expect(page.locator('[data-provenance="none"]').first()).toBeVisible()
  await expect(page.locator('[data-provenance="ai"]').first()).toBeVisible()
  await expect(page.getByTestId('uncategorized-pill').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Focus is visible from the start and J/K move it. (Row identity by DOM
  // id — sandbox data repeats payee+amount, so text isn't unique.)
  await expect(focusedRow(page)).toHaveCount(1)
  const first = await focusedRow(page).getAttribute('id')
  await page.keyboard.press('j')
  const second = await focusedRow(page).getAttribute('id')
  expect(second).not.toBe(first)
  await page.keyboard.press('k')
  expect(await focusedRow(page).getAttribute('id')).toBe(first)

  // C opens the category correction; picking stages it; A accepts — the
  // correction and the accept are ONE review call. (Request bodies are not
  // asserted here: the CSRF-recovery fetch wrapper streams cloned Requests,
  // so CDP can't echo postData — the call count plus the server-side
  // outcome below prove the one-shot contract instead.)
  const reviewCalls: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/transactions\/[^/]+\/review$/.test(request.url())
    ) {
      reviewCalls.push(request.url())
    }
  })
  await page.keyboard.press('c')
  const picker = page.getByTestId('category-picker')
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('combobox')).toBeFocused()
  await picker.getByRole('combobox').fill(CATEGORY)
  await expect(
    picker.getByRole('option', { name: CATEGORY, exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(picker).toHaveCount(0)
  const inspector = page.getByTestId('inbox-inspector')
  await expect(inspector).toContainText('corrected')
  await expect(
    inspector.getByRole('button', { name: 'Accept correction · A' }),
  ).toBeVisible()

  await page.keyboard.press('a')
  await expect(rows(page)).toHaveCount(total - 1)
  expect(reviewCalls).toHaveLength(1)
  // The single call carried the correction: the transaction left the queue
  // wearing the corrected category (read back through the browser session).
  const reviewedBack = await page.request.get(
    `${API}/api/v1/transactions?reviewed=true&limit=100`,
  )
  const reviewedItems = (await reviewedBack.json()) as {
    items: Array<{ category: { name: string } | null }>
  }
  expect(
    reviewedItems.items.some((txn) => txn.category?.name === CATEGORY),
  ).toBe(true)

  // The count falls with every review — progress is felt, not refreshed
  // into existence.
  await expect(badge(page)).toHaveText(String(total - 1))

  // Clear the rest with A alone; focus advances by itself.
  for (let remaining = total - 1; remaining > 0; remaining--) {
    await page.keyboard.press('a')
    await expect(rows(page)).toHaveCount(remaining - 1)
  }

  // Inbox zero: the designed empty state, and the badge retires.
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await expect(page.getByText('Nothing to review')).toBeVisible()
  await expect(badge(page)).toHaveCount(0)
  expect(reviewCalls).toHaveLength(total)
})

test('accept day and accept all are single batch calls; refocus refreshes the count without polling', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const email = uniqueEmail('inbox-batch')
  await seedInbox(email)
  await openInbox(page, email)

  const total = await rows(page).count()
  const batchCalls: string[] = []
  const countCalls: number[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/transactions/review')
    ) {
      batchCalls.push(request.url())
    }
    if (request.url().endsWith('/transactions/unreviewed-count')) {
      countCalls.push(Date.now())
    }
  })

  // Accept a whole day: its rows leave in one batch review.
  const firstDay = page.getByTestId('inbox-day').first()
  const dayRows = await firstDay.getByTestId('inbox-row').count()
  await firstDay.getByRole('button', { name: 'Accept day' }).click()
  await expect(rows(page)).toHaveCount(total - dayRows)
  expect(batchCalls).toHaveLength(1)
  await expect(badge(page)).toHaveText(String(total - dayRows))

  // No polling: an idle window issues no count requests…
  countCalls.length = 0
  await page.waitForTimeout(2_500)
  expect(countCalls).toHaveLength(0)

  // …but refocus re-asks. Review one transaction out-of-band, then wake
  // the tab the way a returning user does.
  await reviewOneViaApi(email, PASSWORD)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(badge(page)).toHaveText(String(total - dayRows - 1), {
    timeout: 10_000,
  })
  await expect(rows(page)).toHaveCount(total - dayRows - 1)

  // Accept all: one batch call to the earned empty state.
  batchCalls.length = 0
  await page.getByRole('button', { name: /Accept all/ }).click()
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  expect(batchCalls).toHaveLength(1)
  await expect(badge(page)).toHaveCount(0)
})

test('provenance and category badges hold AA contrast in both themes', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const email = uniqueEmail('inbox-aa')
  await seedInbox(email)
  await openInbox(page, email)

  const list = page.getByRole('listbox', { name: 'Proposals awaiting review' })
  const assertContrast = async () => {
    for (const provenance of ['rule', 'none', 'ai'] as const) {
      const badgeEl = list.locator(`[data-provenance="${provenance}"]`).first()
      await expect(badgeEl).toBeVisible()
      expect(await contrastRatio(badgeEl)).toBeGreaterThanOrEqual(4.5)
    }
    const pill = list.getByTestId('category-pill').first()
    await expect(pill).toBeVisible()
    expect(await contrastRatio(pill)).toBeGreaterThanOrEqual(4.5)
    const uncategorized = list.getByTestId('uncategorized-pill').first()
    await expect(uncategorized).toBeVisible()
    expect(await contrastRatio(uncategorized)).toBeGreaterThanOrEqual(4.5)
  }

  // Light (the toggle starts at system; pin light explicitly)…
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await assertContrast()

  // …and dark, wireframe #7's right column.
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await assertContrast()
})
