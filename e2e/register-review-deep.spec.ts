import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { pollUnreviewed, waitForDetectedPair } from './helpers/detection'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { createCategory } from './helpers/seed'
import { loginViaUi, setTheme } from './helpers/ui'

// F3 CP3 (#19, wireframe s7's Inspector column), re-addressed by F10 CP1
// (#87) onto the Register's To-review tab: the queue's deep verbs —
// the split editor and transfer consent. Seeding is the honest seam again:
// manual creation defers the same classify job as a sync, and its
// post-classification pass IS the transfer detector (helpers/detection.ts),
// so `det` provenance below is the real pipeline's, never staged.

function rows(page: Page) {
  return page.getByTestId('queue-row')
}

async function openQueue(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Register' }).click()
  await page.getByTestId('view-review').click()
  await expect(page).toHaveURL(/\/register\?view=review$/)
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 })
}

test('the Costco case: S drafts categoried lines, the guard blocks a mismatch, Merge back restores, accept never double-counts', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('queue-split')
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

  await openQueue(page, email)
  await expect(rows(page)).toHaveCount(1)

  // S opens the editor: the whole amount on an inherited first line plus
  // one empty line to fill, wearing the editing chip (wireframe s7b).
  await page.keyboard.press('s')
  const editor = page.getByTestId('split-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toContainText('editing')
  await expect(editor.getByTestId('split-line')).toHaveCount(2)
  await expect(editor.getByLabel('Line 1 amount')).toHaveValue('214.90')

  // + Add line adds one; ✕ removes it; removing the last split line
  // merges back automatically — one line is not a split.
  await editor.getByRole('button', { name: '+ Add line' }).click()
  await expect(editor.getByTestId('split-line')).toHaveCount(3)
  await editor.getByRole('button', { name: 'Remove line 3' }).click()
  await expect(editor.getByTestId('split-line')).toHaveCount(2)
  await editor.getByRole('button', { name: 'Remove line 2' }).click()
  await expect(page.getByTestId('split-editor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept · A' })).toBeEnabled()

  // Lines-vs-total is guarded: a mismatch shows the cue and blocks Save.
  await page.keyboard.press('s')
  await editor.getByLabel('Line 2 amount').fill('10.00')
  const cue = editor.getByTestId('split-cue')
  await expect(cue).toHaveAttribute('data-valid', 'false')
  await expect(cue).toContainText('≠')
  await expect(
    page.getByRole('button', { name: 'Save split · ↩' }),
  ).toBeDisabled()

  // The editor holds in dark too (wireframe pair 1c/1f).
  await setTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(editor).toBeVisible()
  await setTheme(page, 'System')

  // Merge back restores the single, unsplit line — reversible in place.
  await editor.getByRole('button', { name: 'Merge back' }).click()
  await expect(page.getByTestId('split-editor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept · A' })).toBeEnabled()

  // Split again, properly: categories live on the lines; ↩ saves the
  // valid document and closes back to the resting summary.
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
  await page.keyboard.press('Enter')
  await expect(editor).not.toContainText('editing')
  await expect(page.getByRole('button', { name: 'Edit split' })).toBeVisible()

  // Edit split re-opens the staged document; Cancel discards the
  // session's changes and restores it.
  await page.getByRole('button', { name: 'Edit split' }).click()
  await expect(editor).toContainText('editing')
  await editor.getByLabel('Line 2 amount').fill('1.00')
  await expect(cue).toHaveAttribute('data-valid', 'false')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(editor).not.toContainText('editing')
  await expect(editor).toContainText('$50.00')

  // A accepts the staged split document.
  await page.keyboard.press('a')
  await expect(page.getByTestId('queue-empty')).toBeVisible()

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
  const email = uniqueEmail('queue-pair')
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

  await openQueue(page, email)
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
  await setTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(callout).toBeVisible()
  await setTheme(page, 'System')

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
  await expect(page.getByTestId('queue-empty')).toBeVisible()
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
  const email = uniqueEmail('queue-decline')
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

  await openQueue(page, email)
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
  await expect(page.getByTestId('reviewer-panel')).toContainText(
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

test('manual transfer: T without a detected pairing opens the picker — link an ambiguous pair, untracked a lone leg', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('queue-manual-transfer')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  const brokerage = await seed.createAccount('E2E Brokerage')
  // TWO same-magnitude inflows → the detector abstains (mutual uniqueness);
  // the pairing decision falls to the user — exactly the manual verb's case.
  // The outflow lands LAST: an existing detection proposal is never withdrawn
  // by a later sweep, so no intermediate sweep may ever see the outflow with
  // only one inflow present (it would propose, and the proposal would stick).
  await seed.createTxn(savings, {
    date: daysAgo(0),
    amountMinor: 12000,
    description: 'VENMO CASHOUT',
  })
  await seed.createTxn(brokerage, {
    date: daysAgo(3),
    amountMinor: 12000,
    description: 'BROKERAGE SWEEP',
  })
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -12000,
    description: 'VENMO PAYMENT ALEX',
  })
  await seed.dispose()

  await openQueue(page, email)
  await expect(rows(page)).toHaveCount(3)

  // No consent card (nothing was detected) — but T is not a dead verb.
  await rows(page).filter({ hasText: 'VENMO PAYMENT' }).click()
  await expect(page.getByTestId('transfer-consent')).toHaveCount(0)
  await page.keyboard.press('t')
  const picker = page.getByTestId('transfer-picker')
  await expect(picker).toBeVisible()

  // Both same-magnitude legs offered, nearest date first.
  await expect(picker.getByTestId('transfer-choice')).toHaveCount(2)
  await expect(picker.getByTestId('transfer-choice').first()).toContainText(
    'Ally Savings',
  )

  // Picking a leg reviews BOTH sides in one act.
  await picker.getByTestId('transfer-choice').first().click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('BROKERAGE SWEEP')

  // The survivor has no linkable leg left — T offers the untracked form.
  await rows(page).click()
  await page.keyboard.press('t')
  await expect(page.getByTestId('transfer-picker')).toContainText(
    'No linkable leg',
  )
  await page.getByTestId('transfer-untracked').click()
  await expect(page.getByTestId('queue-empty')).toBeVisible()

  // The Register wears the exclusion on all three rows.
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  for (const text of ['VENMO PAYMENT', 'VENMO CASHOUT', 'BROKERAGE SWEEP']) {
    await expect(
      page
        .getByTestId('txn-row')
        .filter({ hasText: text })
        .getByTitle('Transfer — excluded from spending'),
    ).toBeVisible()
  }
})
