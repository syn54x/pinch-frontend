import { expect, type Locator, type Page } from '@playwright/test'

/** The page's content area, scoped away from the sidebar — since Your money
 * (F10 CP3, #89) lists every account's name in the sidebar too, an unscoped
 * `page.getByText(accountLabel)` is ambiguous once that account is
 * non-archived. Use this wherever a test locates content by an account
 * name that isn't itself sidebar-specific. */
export function mainContent(page: Page): Locator {
  return page.locator('main')
}

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

/** The provider picker (F8 CP0) sits between every connect button and the
 * widget: continue with Plaid from an already-open picker dialog. */
export async function continueWithPlaid(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue with Plaid' }).click()
}

/** Connections-page connect: open the picker, take the Plaid card. */
export async function connectViaPicker(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Connect bank' }).click()
  await continueWithPlaid(page)
}
