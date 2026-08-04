import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi, setTheme } from './helpers/ui'

// The Settings surface (F7 CP1, wireframe s23): account configuration behind
// the Profile menu — deep-linkable panes, never a Setup nav entry. Profile
// (email read-only, display name) and Preferences (currency, theme) land
// here; Security and Developer API arrive with CP2.

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
