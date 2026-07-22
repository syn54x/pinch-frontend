import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { pollUnreviewed, waitForDetectedPair } from './helpers/detection'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { createCategory } from './helpers/seed'
import { loginViaUi } from './helpers/ui'

// F3 CP3 (#19, wireframe #7's Inspector column): the Inbox's deep verbs —
// the split editor and transfer consent. Seeding is the honest seam again:
// manual creation defers the same classify job as a sync, and its
// post-classification pass IS the transfer detector (helpers/detection.ts),
// so `det` provenance below is the real pipeline's, never staged.

function rows(page: Page) {
  return page.getByTestId('inbox-row')
}

async function openInbox(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page).toHaveURL(/\/inbox$/)
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 })
}

test('the Costco case: S drafts categoried lines, the guard blocks a mismatch, Merge back restores, accept never double-counts', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('inbox-split')
  await seedUser(email, PASSWORD)
  await createCategory(email, PASSWORD, 'E2E Groceries')
  await createCategory(email, PASSWORD, 'E2E Household')
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -21490,
    description: 'COSTCO WHSE #1021',
  })
  await seed.dispose()

  await openInbox(page, email)
  await expect(rows(page)).toHaveCount(1)

  // S opens the editor: the whole amount on an inherited first line plus
  // one empty line to fill.
  await page.keyboard.press('s')
  const editor = page.getByTestId('split-editor')
  await expect(editor).toBeVisible()
  await expect(editor.getByTestId('split-line')).toHaveCount(2)
  await expect(editor.getByLabel('Line 1 amount')).toHaveValue('214.90')

  // Lines-vs-total is guarded: a mismatch shows the cue and blocks Accept.
  await editor.getByLabel('Line 2 amount').fill('10.00')
  const cue = editor.getByTestId('split-cue')
  await expect(cue).toHaveAttribute('data-valid', 'false')
  await expect(cue).toContainText('≠')
  await expect(
    page.getByRole('button', { name: 'Accept split · A' }),
  ).toBeDisabled()

  // The editor holds in dark too (wireframe pair 1e/1g).
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(editor).toBeVisible()
  await page.getByRole('button', { name: /Switch to system/ }).click()

  // Merge back restores the single, unsplit line — reversible in place.
  await editor.getByRole('button', { name: 'Merge back' }).click()
  await expect(page.getByTestId('split-editor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept · A' })).toBeEnabled()

  // Split again, properly: categories live on the lines.
  await page.keyboard.press('s')
  await editor.getByLabel('Line 1 amount').fill('164.90')
  await editor.getByLabel('Line 1 category').click()
  const picker = page.getByTestId('category-picker')
  await picker.getByRole('combobox').fill('E2E Groceries')
  await picker.getByRole('option', { name: 'E2E Groceries' }).click()
  await editor.getByLabel('Line 2 amount').fill('50.00')
  await editor.getByLabel('Line 2 category').click()
  await picker.getByRole('combobox').fill('E2E Household')
  await picker.getByRole('option', { name: 'E2E Household' }).click()
  await expect(cue).toHaveAttribute('data-valid', 'true')
  await expect(cue).toContainText('✓')

  // Escape hands the keyboard back; A accepts the split document.
  await page.keyboard.press('Escape')
  await page.keyboard.press('a')
  await expect(page.getByTestId('inbox-empty')).toBeVisible()

  // The Register: ONE anchor row wearing the split marking — categories
  // moved to the lines, the raw data stayed put, nothing double-counts.
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  const costco = page.getByTestId('txn-row').filter({ hasText: 'COSTCO' })
  await expect(costco).toHaveCount(1)
  await expect(costco).toContainText('2 splits')
  await expect(costco).toContainText('214.90')
})

test('the Venmo → Ally case: the pair speaks the canonical copy, one consent consumes both sides, the Register excludes both', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('inbox-pair')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -12000,
    description: 'VENMO PAYMENT ALEX',
  })
  await seed.createTxn(savings, {
    date: daysAgo(0),
    amountMinor: 12000,
    description: 'VENMO CASHOUT',
  })
  await seed.dispose()
  await waitForDetectedPair(email, PASSWORD)

  await openInbox(page, email)
  await expect(rows(page)).toHaveCount(2)

  // Real detector provenance on the rows, and the callout under the
  // outflow speaks the canonical voice, naming the other leg's account.
  await expect(
    page.locator('[data-provenance="detection"]').first(),
  ).toBeVisible()
  const callout = page
    .getByTestId('pair-callout')
    .filter({ hasText: 'Ally Savings' })
  await expect(callout).toContainText('pairs with')
  await expect(callout).toContainText('+$120.00')
  await expect(callout).toContainText('both excluded from spending')

  // The callout holds in dark (wireframe 1g's det row).
  await page.getByRole('button', { name: /Switch to light/ }).click()
  await page.getByRole('button', { name: /Switch to dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(callout).toBeVisible()
  await page.getByRole('button', { name: /Switch to system/ }).click()

  // Focus the outflow: the Inspector offers consent with the same callout.
  await rows(page).filter({ hasText: 'VENMO PAYMENT' }).click()
  const consent = page.getByTestId('transfer-consent')
  await expect(consent).toBeVisible()
  await expect(consent).toContainText('both excluded from spending')

  const reviewCalls: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/transactions\/[^/]+\/review$/.test(request.url())
    ) {
      reviewCalls.push(request.url())
    }
  })

  // T: ONE consent consumes both sides — one call, an empty queue.
  await page.keyboard.press('t')
  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  expect(reviewCalls).toHaveLength(1)

  // The Register wears the exclusion on BOTH legs.
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  const outRow = page
    .getByTestId('txn-row')
    .filter({ hasText: 'VENMO PAYMENT' })
  const inRow = page.getByTestId('txn-row').filter({ hasText: 'VENMO CASHOUT' })
  await expect(
    outRow.getByTitle('Transfer — excluded from spending'),
  ).toBeVisible()
  await expect(
    inRow.getByTitle('Transfer — excluded from spending'),
  ).toBeVisible()
})

test('declining a pairing: a category instead withdraws the mirror, both sides review individually, never re-proposed', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const email = uniqueEmail('inbox-decline')
  await seedUser(email, PASSWORD)
  await createCategory(email, PASSWORD, 'E2E Reimbursement')
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -12000,
    description: 'VENMO PAYMENT ALEX',
  })
  await seed.createTxn(savings, {
    date: daysAgo(0),
    amountMinor: 12000,
    description: 'VENMO CASHOUT',
  })
  await waitForDetectedPair(email, PASSWORD)

  await openInbox(page, email)
  await rows(page).filter({ hasText: 'VENMO PAYMENT' }).click()

  // Decline = a different positive decision. The consent card routes to the
  // category picker and says what the choice means.
  await expect(page.getByTestId('transfer-consent')).toContainText(
    'declines the pairing',
  )
  await page.getByRole('button', { name: 'Not a transfer · C' }).click()
  const picker = page.getByTestId('category-picker')
  await picker.getByRole('combobox').fill('E2E Reimbursement')
  await picker.getByRole('option', { name: 'E2E Reimbursement' }).click()
  await expect(page.getByTestId('inbox-inspector')).toContainText(
    'declines the pairing',
  )
  await page.keyboard.press('a')

  // Only the declined side was reviewed; the mirror is withdrawn — the
  // survivor stays, individually reviewable, with no pairing shown.
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('VENMO CASHOUT')
  await expect(page.getByTestId('pair-callout')).toHaveCount(0)

  // Trigger another classification sweep (any ingestion defers it) and
  // prove the rejection memory: the survivor gets a fresh proposal, and it
  // is NOT the detector's — the declined pairing never comes back.
  await seed.createTxn(checking, {
    date: daysAgo(2),
    amountMinor: -777,
    description: 'COFFEE CART',
  })
  await seed.dispose()
  const items = await pollUnreviewed(
    email,
    PASSWORD,
    (unreviewed) =>
      unreviewed.some(
        (txn) =>
          txn.description_raw.includes('COFFEE') && txn.proposal !== null,
      ),
    'the re-classification sweep after the decline',
  )
  const survivor = items.find((txn) =>
    txn.description_raw.includes('VENMO CASHOUT'),
  )
  expect(survivor).toBeDefined()
  expect(survivor?.proposal?.proposed_transfer ?? false).toBe(false)

  // Refocus refreshes the queue; the survivor accepts on its own.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(rows(page)).toHaveCount(2)
  await rows(page).filter({ hasText: 'VENMO CASHOUT' }).click()
  await page.keyboard.press('a')
  await expect(rows(page)).toHaveCount(1)
})
