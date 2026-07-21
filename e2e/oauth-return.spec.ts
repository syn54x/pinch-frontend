import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import {
  mintSandboxPublicToken,
  seedSandboxConnection,
  waitForFirstSync,
} from './helpers/plaid'
import { armPlaidFake } from './helpers/plaid-fake'
import { loginViaUi } from './helpers/ui'

// The OAuth leg, deterministically: the bank redirect lands here with the
// link token persisted across the navigation. The re-init itself runs
// against the fake (real OAuth is the manual acceptance test, #12).

test('a staged OAuth return resumes Link and completes the connect', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('oauth')
  await seedUser(email, PASSWORD)
  await armPlaidFake(page, 'success', await mintSandboxPublicToken())

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/) // session cookie landed
  // The pre-redirect stash, as connect() writes it before open().
  await page.evaluate(() => {
    sessionStorage.setItem(
      'pinch.plaid-oauth',
      JSON.stringify({
        linkToken: 'link-e2e-oauth-token',
        stashedAt: Date.now(),
      }),
    )
  })
  await page.goto('/connect/oauth-return?oauth_state_id=e2e-state')

  // Resume → exchange → back on connections with the row landing.
  await expect(page).toHaveURL(/\/connections/, { timeout: 15_000 })
  const row = page.getByTestId('connection-card')
  await expect(row.getByText('First Platypus Bank')).toBeVisible()
  await expect(row.getByText(/First sync|Syncing|Synced /)).toBeVisible()
})

test('a repair-mode OAuth return skips the exchange and syncs the same connection', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('oauthrepair')
  await seedUser(email, PASSWORD)
  await seedSandboxConnection(email, PASSWORD)
  await waitForFirstSync(email, PASSWORD)
  await armPlaidFake(page, 'success')

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Connections' }).click()
  const connectionId = await page
    .getByTestId('connection-card')
    .getAttribute('data-connection-id')

  await page.evaluate(
    ({ id }) => {
      sessionStorage.setItem(
        'pinch.plaid-oauth',
        JSON.stringify({
          linkToken: 'link-e2e-oauth-repair',
          connectionId: id,
          stashedAt: Date.now(),
        }),
      )
    },
    { id: connectionId },
  )
  await page.goto('/connect/oauth-return?oauth_state_id=e2e-state')

  await expect(page).toHaveURL(/\/connections/, { timeout: 15_000 })
  // Same single connection — repaired, never duplicated.
  await expect(page.getByTestId('connection-card')).toHaveCount(1)
  await expect(
    page.getByTestId('connection-card').getByText(/Syncing|Synced /),
  ).toBeVisible({ timeout: 90_000 })
})

test('an OAuth return without staged state shows the expired screen', async ({
  page,
}) => {
  const email = uniqueEmail('oauthexp')
  await seedUser(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/connect/oauth-return')

  await expect(page.getByText(/connect attempt expired/i)).toBeVisible()
  await page.getByRole('link', { name: /start again/i }).click()
  await expect(page).toHaveURL(/\/connections/)
})
