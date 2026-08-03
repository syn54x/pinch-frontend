import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import {
  clearInvestments,
  forceInvestmentsConsent,
  stageInvestments,
} from './helpers/db'
import { seedSandboxConnection, waitForFirstSync } from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { loginViaUi } from './helpers/ui'

// M10 companion (pinch-frontend#66): the investments detail page and the
// Enable-investments consent affordance. Holdings are provider-owned with
// no write API (ADR 0007), so rendering tests stage rows through the DB
// side-channel; the consent arc runs against the real sandbox connection.

test('an investment account deep-links to holdings and activity', async ({
  page,
}) => {
  const email = uniqueEmail('holdings')
  await seedUser(email, PASSWORD, [
    {
      kind: 'investment',
      label: 'Stash Brokerage',
      currency: 'USD',
      balanceMinor: 500_000,
    },
  ])
  await stageInvestments(email)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Accounts' }).click()
  await page.getByText('Stash Brokerage').click()

  await expect(
    page.getByRole('heading', { name: /Stash Brokerage/ }),
  ).toBeVisible()

  // Positions: both staged holdings, with identity, value, and cost basis.
  const holdings = page.getByTestId('holding-row')
  await expect(holdings).toHaveCount(2)
  const aapl = holdings.filter({ hasText: 'Apple Inc.' })
  await expect(aapl).toContainText('AAPL')
  await expect(aapl).toContainText('10.5')
  await expect(aapl).toContainText('$1,996.30')
  await expect(aapl).toContainText('$1,500.55')
  await expect(holdings.filter({ hasText: 'Vanguard' })).toContainText('VTI')

  // Activity: newest first, amounts signed from the account's perspective.
  const activities = page.getByTestId('activity-row')
  await expect(activities).toHaveCount(2)
  await expect(activities.first()).toContainText('AAPL DIVIDEND')
  await expect(activities.first()).toContainText('+$8.72')
  await expect(activities.last()).toContainText('BUY APPLE INC')
  await expect(activities.last()).toContainText('−$770.00')
  await expect(activities.last()).toContainText('buy · AAPL · 0.4')
})

test('an empty manual investment account is honest about why', async ({
  page,
}) => {
  const email = uniqueEmail('inv-empty')
  await seedUser(email, PASSWORD, [
    {
      kind: 'investment',
      label: 'Paper Portfolio',
      currency: 'USD',
      balanceMinor: 100_000,
    },
  ])

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Accounts' }).click()
  await page.getByText('Paper Portfolio').click()

  await expect(page.getByTestId('investments-empty')).toContainText(
    "Manual accounts don't sync holdings.",
  )
  await expect(page.getByTestId('activity-empty')).toBeVisible()
})

test('a consent-waiting connection offers Enable investments end to end', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('consent')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)
  // Stage the retrofit posture deterministically: whatever the sandbox
  // investments phase did, the user's world becomes "connected, nothing
  // granted" — empty investments tables + the consent flag up.
  await clearInvestments(email)
  await forceInvestmentsConsent(email)
  await armPlaidFake(page, 'success')

  await loginViaUi(page, email, PASSWORD)

  // The sandbox institution carries an investment-kind account (the 401k),
  // so the accounts page deep-links it — and its detail reads the consent
  // state honestly, pointing back at the connection.
  await page.getByRole('link', { name: 'Accounts' }).click()
  await page.getByText('Plaid 401k').click()
  await expect(page.getByTestId('investments-consent-empty')).toContainText(
    'Waiting on investments access',
  )
  await page
    .getByTestId('investments-consent-empty')
    .getByRole('link', { name: 'Enable investments' })
    .click()

  // The connections card carries the affordance; the walk is the repair
  // arc in different clothes — update-mode Link, then a proving resync.
  const row = page.getByTestId('connection-card')
  await expect(row.getByTestId('enable-investments')).toBeVisible()
  await row.getByTestId('enable-investments').click()
  await expect(row.getByText(/Syncing|First sync/)).toBeVisible()
  await expect(row.getByText(/Synced /)).toBeVisible({ timeout: 90_000 })
})
