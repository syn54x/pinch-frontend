import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F4 CP0 (#58, wireframe s17): the Categories & Rules surface exists —
// nav entry, four deep-linkable tab routes, one page shell.
test('categories surface mounts with four routable tabs', async ({ page }) => {
  const email = uniqueEmail('cats-shell')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)

  const navLink = page.getByRole('link', { name: 'Categories & Rules' })
  await navLink.click()
  await expect(page).toHaveURL(/\/categories$/)
  await expect(page.getByTestId('categories-tab')).toBeVisible()

  const tabs = page.getByRole('navigation', { name: 'Categories & Rules tabs' })
  await tabs.getByRole('link', { name: 'Rules' }).click()
  await expect(page).toHaveURL(/\/categories\/rules$/)
  await expect(page.getByTestId('rules-tab')).toBeVisible()

  await tabs.getByRole('link', { name: 'Learning' }).click()
  await expect(page).toHaveURL(/\/categories\/learning$/)
  await expect(page.getByTestId('learning-tab')).toBeVisible()

  // Deep link straight into a tab: the URL is the state.
  await page.goto('/categories/tags')
  await expect(page.getByTestId('tags-tab')).toBeVisible()

  // The shell knows where it is: header title + active nav item.
  await expect(
    page.getByRole('heading', { name: 'Categories & Rules' }),
  ).toBeVisible()
})
