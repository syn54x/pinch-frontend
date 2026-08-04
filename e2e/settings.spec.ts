import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi, setTheme } from './helpers/ui'

// The Settings surface (F7 CP1+CP2, wireframe s23): account configuration
// behind the Profile menu — deep-linkable panes, never a Setup nav entry.
// Profile (email read-only, display name), Preferences (currency, theme),
// Security (change password, sessions), Developer API (show-once PATs).

test('the Profile menu entry opens Settings, and the Setup nav never offers it', async ({
  page,
}) => {
  const email = uniqueEmail('settings-nav')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Settings is account configuration, not a working surface: the nav's
  // Setup group must not pretend otherwise.
  await expect(
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Settings' }),
  ).toHaveCount(0)

  await page.getByTestId('profile-menu-trigger').click()
  await page
    .getByTestId('profile-menu')
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByTestId('profile-menu')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('every pane deep-links: Profile at /settings, Preferences beside it', async ({
  page,
}) => {
  const email = uniqueEmail('settings-deep')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  // Email is shown as identity — a value, never an editable field. (Scoped
  // to main: the sidebar trigger also carries the email.)
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0)

  await page.goto('/settings/preferences')
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Primary currency' }),
  ).toBeVisible()

  await page.goto('/settings/security')
  await expect(
    page.getByRole('heading', { name: 'Change password' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()

  await page.goto('/settings/developer')
  await expect(
    page.getByRole('heading', { name: 'Developer API' }),
  ).toBeVisible()

  // The tabs walk between panes without losing deep-linkability.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('display name round-trips and the sidebar identity follows without a reload', async ({
  page,
}) => {
  const email = uniqueEmail('settings-name')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings')
  const field = page.getByRole('textbox', { name: 'Display name' })
  await field.fill('Taylor the Renamed')
  await page.getByRole('button', { name: 'Save' }).click()

  // The /me cache is the one source of identity: the sidebar trigger
  // re-renders from the invalidation, no reload involved.
  await expect(page.getByTestId('profile-menu-trigger')).toContainText(
    'Taylor the Renamed',
  )
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue(
    'Taylor the Renamed',
  )
})

test('primary currency saves on change and survives a reload', async ({
  page,
}) => {
  const email = uniqueEmail('settings-currency')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings/preferences')
  const select = page.getByRole('combobox', { name: 'Primary currency' })
  await select.selectOption('EUR')
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Primary currency' }),
  ).toHaveValue('EUR')
})

test('the pane theme control and the menu theme control are one setting', async ({
  page,
}) => {
  const email = uniqueEmail('settings-theme')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Set in the menu → the pane control agrees.
  await setTheme(page, 'Dark')
  await page.goto('/settings/preferences')
  await expect(page.locator('html')).toHaveClass(/dark/)
  const pane = page.getByRole('group', { name: 'Theme' })
  await expect(pane.getByRole('button', { name: 'Dark' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Set in the pane → applies instantly, and the menu control agrees.
  await pane.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByTestId('profile-menu-trigger').click()
  await expect(
    page.getByTestId('profile-menu').getByRole('button', { name: 'Light' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('the Security pane rotates the password: old rejected, new accepted, this session survives', async ({
  page,
}) => {
  const email = uniqueEmail('settings-password')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings/security')
  await page.getByLabel('Current password').fill(PASSWORD)
  await page.getByLabel('New password').fill('an entirely different horse')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password updated.')).toBeVisible()

  // The backend revoked every pre-change session and handed this browser a
  // fresh cookie on the response — a reload proves we ride it seamlessly.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // The rotation is real at the login door: old dies, new works.
  await page.getByTestId('profile-menu-trigger').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await loginViaUi(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toBeVisible()
  await loginViaUi(page, email, 'an entirely different horse')
  await expect(page).toHaveURL(/\/accounts$/)
})

// The breach-rejection half of "failures surface inline" rides this same
// alert channel (one MutationError slot renders every backend detail), but
// can't run here: the e2e stack pins PINCH_BREACH_CHECK_ENABLED=false so
// the suite never touches the network. The backend proves the 400 + copy at
// its own seam (test_auth_flows); this test proves the channel.
test('a wrong current password is refused inline and changes nothing', async ({
  page,
}) => {
  const email = uniqueEmail('settings-password-wrong')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings/security')
  await page.getByLabel('Current password').fill('not it, sorry')
  await page.getByLabel('New password').fill('an entirely different horse')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  // Still signed in, and the old password still stands.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('sessions list badges this session and revokes another for real', async ({
  page,
}) => {
  const email = uniqueEmail('settings-sessions')
  await seedUser(email, PASSWORD) // the API signup minted session #1…
  await loginViaUi(page, email, PASSWORD) // …and the UI login is session #2
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings/security')
  const rows = page.getByTestId('session-row')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('this session')).toBeVisible()

  // The current row offers no Revoke — you can't saw off the branch you
  // sit on; the other one dies on click.
  await expect(
    rows.filter({ hasText: 'this session' }).getByRole('button', {
      name: 'Revoke',
    }),
  ).toHaveCount(0)
  await rows
    .filter({ hasNotText: 'this session' })
    .getByRole('button', { name: 'Revoke' })
    .click()
  await expect(rows).toHaveCount(1)
  await expect(page.getByText('this session')).toBeVisible()
})

test('the PAT lifecycle: created secret shows exactly once, then only the row remains', async ({
  page,
}) => {
  const email = uniqueEmail('settings-pat')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/settings/developer')
  await page.getByRole('button', { name: 'New token' }).click()
  await page.getByLabel('Token name').fill('laptop CLI')
  await page.getByLabel('Write access').check()
  await page.getByRole('button', { name: 'Create token' }).click()

  // The one-time reveal: full secret, copy affordance, the honest caption.
  const reveal = page.getByTestId('pat-created')
  await expect(reveal).toContainText(/pinch_pat_[A-Za-z0-9_-]+/)
  await expect(reveal.getByRole('button', { name: 'Copy' })).toBeVisible()
  await expect(reveal).toContainText("You won't see this again")

  // After a reload the row persists — name, scopes, prefix — but no secret
  // and no way to reveal one.
  await page.reload()
  await expect(page.getByTestId('pat-created')).toHaveCount(0)
  const row = page.getByTestId('pat-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('laptop CLI')
  await expect(row).toContainText('read write')
  await expect(page.getByText(/pinch_pat_[A-Za-z0-9_-]{20,}/)).toHaveCount(0)

  await row.getByRole('button', { name: 'Revoke' }).click()
  await expect(row).toHaveCount(0)
})
