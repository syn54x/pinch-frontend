import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi, setTheme } from './helpers/ui'

// The Profile menu (F7 CP0, wireframe s23b): the user row — which used to
// show your name and do nothing — is now the popout holding identity, theme,
// and Log out. No Settings entry until the surface exists (CP1): the shell's
// no-disabled-destinations law extends to menu items.

test('the user row opens the menu — identity, theme, Log out, and both dismissals', async ({
  page,
}) => {
  const email = uniqueEmail('pmenu')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.getByTestId('profile-menu-trigger').click()
  const menu = page.getByTestId('profile-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByText(email)).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(
    menu.getByRole('group', { name: 'Theme' }).getByRole('button'),
  ).toHaveCount(3)
  await expect(menu.getByText('Settings')).toHaveCount(0) // CP1's, not yet

  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  // Escape hands focus back to the trigger — the keyboard never gets lost.
  await expect(page.getByTestId('profile-menu-trigger')).toBeFocused()

  // The relocation is total: with the menu closed, the chrome offers no
  // logout and no theme control anywhere — the bar is title + Ask Penny.
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)

  await page.getByTestId('profile-menu-trigger').click()
  await expect(menu).toBeVisible()
  // Outside click (raw coordinates: the modal menu aria-hides the page,
  // so role-based targeting of the background is rightly impossible).
  await page.mouse.click(640, 400)
  await expect(menu).not.toBeVisible()
})

test('theme picked in the menu applies instantly and survives reload', async ({
  page,
}) => {
  const email = uniqueEmail('pmenu-theme')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await setTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  // The control agrees with the applied theme after the round trip.
  await page.getByTestId('profile-menu-trigger').click()
  await expect(
    page.getByTestId('profile-menu').getByRole('button', { name: 'Dark' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await setTheme(page, 'Light')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('the menu is keyboard-operable end to end', async ({ page }) => {
  const email = uniqueEmail('pmenu-kbd')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.getByTestId('profile-menu-trigger').focus()
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('profile-menu')
  await expect(menu).toBeVisible()

  // Opening lands focus on the first control; Tab walks every stop — this
  // enumeration is deliberate, so CP1's Settings entry must extend it.
  await expect(menu.getByRole('button', { name: 'Light' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Dark' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'System' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Log out' })).toBeFocused()

  // Enter on Log out works without a pointer: the session actually dies.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/accounts')
  await expect(page).toHaveURL(/\/login/)
})
