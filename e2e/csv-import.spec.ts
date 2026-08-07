import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { RegisterSeeder } from './helpers/register'
import { createPayeeRule } from './helpers/seed'
import { loginViaUi } from './helpers/ui'

// F10 CP6 (#92, wireframe s9/2a): the CSV import wizard — upload, map,
// preview, commit — driving the existing server-side pipeline end-to-end.
// Both specs use a header shape ("Date,Description,Amount") the backend's
// deterministic inferrer already recognizes (imports/inference.py's own
// synonym set — the same shape pinch-backend's own import tests seed with),
// so the mapping step's pre-filled roles need no correction: Continue is
// the only interaction there, which is itself coverage of the mapping
// step's prefill reading the suggested mapping correctly.

function rows(page: Page) {
  return page.getByTestId('txn-row')
}

function rowFor(page: Page, payee: string) {
  return rows(page).filter({ hasText: payee })
}

async function openRegister(page: Page, email: string) {
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
}

function csvFile(content: string) {
  return {
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  }
}

/** Open the wizard, upload `csv` onto the (only) manual account, and
 * confirm the mapping step's pre-fill as-is. Returns the open dialog. */
async function uploadAndConfirmMapping(page: Page, csv: string) {
  await page.getByTestId('import-trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Import CSV' })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('import-file-input').setInputFiles(csvFile(csv))
  await dialog.getByTestId('import-upload-submit').click()
  await expect(dialog.getByTestId('import-mapping-confirm')).toBeVisible()
  await dialog.getByTestId('import-mapping-confirm').click()
  return dialog
}

test('the auto-file default toggle files rule-matched rows and leaves the rest reviewed-but-uncategorized', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const email = uniqueEmail('csv-autofile')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const categoryId = await seed.categoryId('E2E Coffee')
  await seed.createAccount('CSV Checking')
  await seed.dispose()
  // Seeded before the import so the classify sweep's rule pass genuinely
  // matches it (the manual-add.spec precedent for real `rule` provenance).
  await createPayeeRule(email, PASSWORD, { contains: 'COFFEE', categoryId })

  await openRegister(page, email)
  const dialog = await uploadAndConfirmMapping(
    page,
    'Date,Description,Amount\n' +
      '2026-01-05,COFFEE SHOP,-4.50\n' +
      '2026-01-06,MYSTERY VENDOR,-12.00\n',
  )

  // Preview: a fresh account has no duplicates, and auto-file is on by
  // default (story 34) — the toggle itself proves the default without any
  // interaction.
  await expect(dialog.getByText('2 valid rows')).toBeVisible()
  await expect(dialog.getByTestId('import-auto-file-toggle')).toBeChecked()
  await dialog.getByTestId('import-commit').click()

  // The classify job (async worker) runs rules against the imported rows,
  // then auto-files: COFFEE SHOP matches the rule and lands categorized;
  // MYSTERY VENDOR matches nothing and lands reviewed-but-uncategorized —
  // exactly the "even the AI can't categorize" completion split (story 35).
  await expect(dialog.getByTestId('import-complete-message')).toHaveText(
    '2 imported · 1 still needs a category',
    { timeout: 90_000 },
  )

  await dialog.getByTestId('import-uncategorized-link').click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/register\?view=uncategorized$/)
  await expect(rowFor(page, 'MYSTERY VENDOR')).toBeVisible()
  await expect(rowFor(page, 'COFFEE SHOP')).toHaveCount(0)

  // The rule-matched row landed categorized and reviewed — no queue entry
  // for either row (both were auto-filed, one with a category, one bare).
  await page.getByTestId('view-review').click()
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'COFFEE SHOP' }),
  ).toHaveCount(0)
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'MYSTERY VENDOR' }),
  ).toHaveCount(0)
})

test('duplicate rows are flagged and excluded by default, with a per-row override', async ({
  page,
}) => {
  const email = uniqueEmail('csv-dupe')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  await seed.createAccount('Wallet')
  await seed.dispose()

  await openRegister(page, email)
  // Two genuinely identical coffees, same day, same amount — the
  // within-file duplicate case (PRD story 33): both rows flag, and the
  // escape hatch is per row, not per import.
  const dialog = await uploadAndConfirmMapping(
    page,
    'Date,Description,Amount\n' +
      '2026-01-05,BLUE BOTTLE COFFEE,-4.50\n' +
      '2026-01-05,BLUE BOTTLE COFFEE,-4.50\n',
  )

  const duplicateRows = dialog.getByTestId('import-duplicate-row')
  await expect(duplicateRows).toHaveCount(2)
  await expect(dialog.getByText('2 duplicate rows skipped')).toBeVisible()

  // Auto-file off keeps this deterministic (no async settle to wait on) —
  // the story under test here is the duplicate override, not auto-file.
  await dialog.getByTestId('import-auto-file-toggle').uncheck()

  // Both start unchecked (excluded by default); override exactly one.
  const firstCheckbox = duplicateRows.nth(0).locator('input[type="checkbox"]')
  const secondCheckbox = duplicateRows.nth(1).locator('input[type="checkbox"]')
  await expect(firstCheckbox).not.toBeChecked()
  await expect(secondCheckbox).not.toBeChecked()
  await firstCheckbox.check()
  await expect(dialog.getByText('1 row will be imported')).toBeVisible()

  await dialog.getByTestId('import-commit').click()
  await expect(dialog.getByTestId('import-complete-message')).toHaveText(
    '1 imported — sent to review',
  )

  await dialog.getByTestId('import-review-link').click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/register\?view=review$/)
  // Exactly one coffee landed — the un-overridden duplicate never committed.
  await expect(
    page.getByTestId('queue-row').filter({ hasText: 'BLUE BOTTLE COFFEE' }),
  ).toHaveCount(1)
})
