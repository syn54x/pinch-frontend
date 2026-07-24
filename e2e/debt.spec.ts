import { expect, type Page, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { loginViaUi } from './helpers/ui'

// F5 CP4 (#31, wireframe s14/s15/s15b): the Debt suite. Seeding is a real loan
// account (+ optional balance) through seedUser, with terms set via the accounts
// PATCH. The journey — a loan without terms gates its projection honestly, then
// adding terms unlocks it — is the spec's spine; never-pays-off and the warn
// markers are the other two. Term↔maturity math is unit-tested separately.

interface Terms {
  apr?: number
  minimum_payment_minor?: number
}

/** Seed a loan (label "E2E Auto Loan") with a negative balance, optionally
 * setting terms via PATCH. Returns nothing — the UI is the subject. */
async function seedLoan(
  email: string,
  balanceMinor: number,
  terms?: Terms,
): Promise<void> {
  await seedUser(email, PASSWORD, [
    { kind: 'loan', label: 'E2E Auto Loan', currency: 'USD', balanceMinor },
  ])
  if (terms === undefined) return
  const { ctx, csrf } = await authedContext(email, PASSWORD)
  try {
    const { items } = (await (await ctx.get('/api/v1/accounts')).json()) as {
      items: { id: string; kind: string }[]
    }
    const loan = items.find((a) => a.kind === 'loan')
    if (loan === undefined) throw new Error('seeded loan not found')
    const res = await ctx.patch(`/api/v1/accounts/${loan.id}`, {
      data: terms,
      headers: await csrf(),
    })
    if (!res.ok()) {
      throw new Error(`set terms failed: ${res.status()} ${await res.text()}`)
    }
  } finally {
    await ctx.dispose()
  }
}

async function openDebt(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: /Debt view/ }).click()
  await expect(page).toHaveURL(/\/accounts\/debt$/)
}

test('journey: a loan without terms gates the projection, adding terms unlocks it', async ({
  page,
}) => {
  const email = uniqueEmail('debt-journey')
  await seedLoan(email, -680_000) // no terms
  await openDebt(page, email)

  // The list annotates the missing terms honestly.
  await expect(page.getByTestId('debt-missing-banner')).toBeVisible()
  await expect(page.getByTestId('debt-loan-row')).toContainText('Add terms')

  // Detail is the s15b terms-not-set state — real balance, never a fake date.
  await page.getByTestId('debt-loan-row').click()
  await expect(page).toHaveURL(/\/accounts\/debt\/[^/]+$/)
  await expect(page.getByTestId('debt-recent-payments')).toBeVisible()
  await expect(page.getByText(/never a fabricated date/i)).toBeVisible()
  await expect(page.getByTestId('debt-whatif')).toHaveCount(0)

  // Add terms → the projection unlocks.
  await page.getByRole('link', { name: 'Add terms' }).click()
  await page.getByLabel('APR %').fill('5')
  await page.getByLabel('Minimum payment ($ / mo)').fill('200')
  await page.getByRole('button', { name: 'Save terms' }).click()

  await expect(page.getByTestId('debt-whatif')).toBeVisible()
  await expect(page.getByTestId('debt-recent-payments')).toHaveCount(0)
})

test('never pays off: a minimum below the monthly interest reads the honest state', async ({
  page,
}) => {
  const email = uniqueEmail('debt-never')
  // $10,000 at 24% APR = $200/mo interest; a $150 minimum never amortizes.
  await seedLoan(email, -1_000_000, {
    apr: 24,
    minimum_payment_minor: 15_000,
  })
  await openDebt(page, email)

  await page.getByTestId('debt-loan-row').click()
  await expect(page.getByText('Minimum only')).toBeVisible()
  await expect(page.getByText(/never at this rate/i).first()).toBeVisible()
})

test('warn markers: excluded aggregates say why', async ({ page }) => {
  const email = uniqueEmail('debt-warn')
  await seedLoan(email, -680_000) // no terms → excluded from every aggregate
  await openDebt(page, email)

  // Weighted APR can't be computed → "—"; the missing-terms banner explains.
  await expect(page.getByTestId('debt-missing-banner')).toContainText(
    /need terms/i,
  )
  await expect(page.getByText('Weighted APR')).toBeVisible()
  await expect(page.getByText('add terms to project')).toBeVisible()
})

test('debt holds AA contrast in both themes', async ({ page }) => {
  const email = uniqueEmail('debt-contrast')
  await seedLoan(email, -1_000_000, { apr: 24, minimum_payment_minor: 15_000 })
  await openDebt(page, email)
  await page.getByTestId('debt-loan-row').click()

  async function assertContrast() {
    for (const locator of [
      page.getByText('Balance').first(),
      page.getByText('Minimum only'),
      page.getByRole('heading', { name: 'E2E Auto Loan' }),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }

  await assertContrast()
  await page.getByRole('button', { name: /Switch to (light|dark)/ }).click()
  await assertContrast()
})
