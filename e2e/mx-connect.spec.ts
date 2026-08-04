import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import {
  deleteMxUsersExcept,
  listMxUserGuids,
  seedMxMember,
} from './helpers/mx'
import { armMxFake } from './helpers/mx-fake'
import { loginViaUi } from './helpers/ui'

// The MX connect path (F8 CP1, wireframes 7c/7d): the widget is faked at
// its own network boundary (the fixture posts the captured postMessage
// sequence); everything behind it is real — the backend's enrollment,
// member verify, and account creation run against MX's live integration
// sandbox. The suite's second accepted non-hermetic edge.
//
// These specs need MX credentials (process env or the backend .env) and
// deliberately never touch Plaid's — the local production-creds caveat
// that blocks sandbox-token-minting Plaid specs does not apply here.

// Every "Continue with MX" mints a lazy enrollment user on the MX dev
// account; sweep everything this run created so the account stays clean.
let baselineUsers: Set<string>
test.beforeAll(async () => {
  baselineUsers = new Set(await listMxUserGuids())
})
test.afterAll(async () => {
  await deleteMxUsersExcept(baselineUsers)
})

test('connect MX Bank: sheet → working wait → real member → accounts with balances', async ({
  page,
}) => {
  // Seeding waits out MX's real aggregation (~14s) before the UI walk.
  test.setTimeout(180_000)
  const email = uniqueEmail('mx-connect')
  await seedUser(email, PASSWORD)
  const { memberGuid } = await seedMxMember(email, PASSWORD)
  await armMxFake(page, 'success', memberGuid)

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page.getByRole('button', { name: 'Continue with MX' }).click()

  // The Pinch-owned sheet (7c): header, step count, privacy line — the
  // interior is the (faked) widget document inside a real iframe.
  const sheet = page.getByTestId('mx-connect-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Connect your bank')
  await expect(sheet).toContainText('Step 2 of 2')
  await expect(sheet).toContainText('Pinch never sees your bank password.')

  // The connecting hold: memberConnected arrives well after the widget
  // starts working (~14s in sandbox) — the sheet says so out loud.
  await expect(page.getByTestId('mx-working')).toBeVisible()

  // memberConnected → completion ({provider:'mx', token: member_guid})
  // → the sheet leaves and the connection lands, accounts included.
  const row = page.getByTestId('connection-card')
  await expect(row).toHaveCount(1, { timeout: 30_000 })
  await expect(sheet).toHaveCount(0)
  await expect(row).toContainText('MX Bank')
  // MX Bank's scripted member carries 6 accounts (CP0 spike).
  await expect(row).toContainText('6 accounts')

  // Balances arrived in the same breath (M13 CP2's connect-time balance
  // entries) — no sync wait: MX transaction sync is CP3, not this pin.
  await page.getByRole('link', { name: 'Accounts' }).click()
  await expect(
    page.getByTestId('account-card').getByText(/\$\d/).first(),
  ).toBeVisible()
})

test('cancelling the MX sheet returns to the picker: tried mark + promoted next', async ({
  page,
}) => {
  const email = uniqueEmail('mx-cancel')
  await seedUser(email, PASSWORD)
  await armMxFake(page, 'cancel')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page.getByRole('button', { name: 'Continue with MX' }).click()

  const sheet = page.getByTestId('mx-connect-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)

  // Returned-empty (7d): a fork, not a failure — back in the picker, MX
  // marked tried with the honest copy, the next way in promoted.
  const picker = page.getByTestId('provider-picker')
  await expect(picker).toBeVisible()
  await expect(picker).toContainText(
    'Nothing was connected — pick another way in.',
  )
  const mxCard = page.getByTestId('provider-card-mx')
  await expect(mxCard).toContainText('tried')
  await expect(mxCard).toContainText(
    'Came back without connecting. MX doesn’t tell us why.',
  )
  await expect(
    mxCard.getByRole('button', { name: 'Try MX again' }),
  ).toBeEnabled()
  await expect(
    page.getByTestId('provider-card-plaid').getByRole('button', {
      name: 'Try Plaid',
      exact: true,
    }),
  ).toBeVisible()

  // No residue: nothing was created, nothing reads as an error.
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('an MX widget error reopens the picker with an inline notice', async ({
  page,
}) => {
  const email = uniqueEmail('mx-error')
  await seedUser(email, PASSWORD)
  await armMxFake(page, 'error')

  await loginViaUi(page, email, PASSWORD)
  await page.getByRole('link', { name: 'Connections' }).click()
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await page.getByRole('button', { name: 'Continue with MX' }).click()

  // The fixture answers createMemberError — the typed-throw outcome: the
  // sheet tears down and the picker reopens with the notice inline.
  await expect(page.getByTestId('provider-picker')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'MX could not connect this bank',
  )
  await expect(page.getByTestId('mx-connect-sheet')).toHaveCount(0)
  await expect(page.getByTestId('connection-card')).toHaveCount(0)
})
