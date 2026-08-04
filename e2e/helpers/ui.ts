import { expect, type Page } from '@playwright/test'

/** Log in through the UI — for tests where login is setup, not the subject. */
export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Pick a theme via the Profile menu's segmented control (its F7 CP0 home),
 * leaving the menu closed again. */
export async function setTheme(
  page: Page,
  theme: 'Light' | 'Dark' | 'System',
): Promise<void> {
  await page.getByTestId('profile-menu-trigger').click()
  await page
    .getByTestId('profile-menu')
    .getByRole('button', { name: theme })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('profile-menu')).not.toBeVisible()
}

/** Flip to the other resolved theme — the both-themes contrast idiom. */
export async function toggleTheme(page: Page): Promise<void> {
  const dark = await page
    .locator('html')
    .evaluate((el) => el.classList.contains('dark'))
  await setTheme(page, dark ? 'Light' : 'Dark')
}
