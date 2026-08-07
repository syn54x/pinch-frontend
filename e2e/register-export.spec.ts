import { readFile } from 'node:fs/promises'
import { type Download, expect, type Page, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { daysAgo, RegisterSeeder } from './helpers/register'
import { loginViaUi } from './helpers/ui'

// F10 CP7 (#93): Register export. The button walks the listing's keyset
// cursor with the active filters and downloads the result as CSV — the file
// is what the filters say, never what the viewport saw. Page stitching and
// serialization are vitest-covered pure logic; this spec asserts the
// downloaded file's shape through the real stack.

async function openRegister(page: Page, email: string) {
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
}

async function downloadedCsv(download: Download): Promise<string[]> {
  const path = await download.path()
  const content = await readFile(path, 'utf8')
  return content.split('\r\n')
}

test('export downloads the current filtered set as CSV', async ({ page }) => {
  const email = uniqueEmail('reg-export')
  await seedUser(email, PASSWORD)
  const seed = await RegisterSeeder.login(email, PASSWORD)
  const checking = await seed.createAccount('Chase Checking')
  const savings = await seed.createAccount('Ally Savings')
  await seed.createTxn(checking, {
    date: daysAgo(0),
    amountMinor: -6240,
    description: 'WHOLEFDS #10234 AUSTIN TX',
    displayName: 'Whole Foods Market',
    category: 'Groceries',
    tags: ['food'],
    notes: 'warehouse run',
  })
  await seed.createTxn(checking, {
    date: daysAgo(1),
    amountMinor: -1825,
    description: 'Uber — client, visit',
    category: 'Transport',
  })
  await seed.createTxn(savings, {
    date: daysAgo(1),
    amountMinor: 1103,
    description: 'Interest payment',
    category: 'Income',
  })
  await seed.dispose()

  await openRegister(page, email)
  await expect(page.getByTestId('txn-row')).toHaveCount(3)

  // Unfiltered: every row the ledger holds, in listing order, RFC 4180
  // quoting on the comma-bearing payee.
  const exportButton = page.getByTestId('register-export')
  const fullDownload = page.waitForEvent('download')
  await exportButton.click()
  const full = await fullDownload
  expect(full.suggestedFilename()).toMatch(
    /^pinch-register-\d{4}-\d{2}-\d{2}\.csv$/,
  )
  const fullLines = await downloadedCsv(full)
  expect(fullLines[0]).toBe(
    'date,payee,category,tags,amount,currency,pending,notes',
  )
  expect(fullLines).toHaveLength(4)
  expect(fullLines[1]).toBe(
    `${daysAgo(0)},Whole Foods Market,Groceries,food,-$62.40,USD,,warehouse run`,
  )
  expect(fullLines.slice(1)).toContainEqual(
    expect.stringContaining('"Uber — client, visit"'),
  )
  expect(fullLines.join('\n')).toContain('Interest payment')

  // Filtered to Chase Checking: the savings row leaves the file — the
  // export respects the filter set exactly.
  await page.getByTestId('chip-account').click()
  await page.getByRole('button', { name: /Chase Checking/ }).click()
  await expect(page.getByTestId('txn-row')).toHaveCount(2)
  const filteredDownload = page.waitForEvent('download')
  await exportButton.click()
  const filteredLines = await downloadedCsv(await filteredDownload)
  expect(filteredLines).toHaveLength(3)
  expect(filteredLines.join('\n')).not.toContain('Interest payment')
  expect(filteredLines.join('\n')).toContain('Whole Foods Market')
})
