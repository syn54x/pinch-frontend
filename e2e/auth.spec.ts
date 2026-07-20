import { expect, test } from '@playwright/test'
import {
  PASSWORD,
  revokeOtherSessions,
  seedUser,
  uniqueEmail,
} from './helpers/api'
import { loginViaUi } from './helpers/ui'

test('login lands on the accounts page showing seeded accounts', async ({
  page,
}) => {
  const email = uniqueEmail('login')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Everyday Checking', currency: 'USD' },
  ])

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Everyday Checking')).toBeVisible()
})

test('logged-out deep link redirects to login and returns after', async ({
  page,
}) => {
  const email = uniqueEmail('deeplink')
  await seedUser(email, PASSWORD, [
    { kind: 'credit', label: 'Travel Card', currency: 'USD' },
  ])

  await page.goto('/accounts')
  await expect(page).toHaveURL(/\/login\?.*redirect/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('Travel Card')).toBeVisible()
})

test('logout revokes the session for real', async ({ page }) => {
  const email = uniqueEmail('logout')
  await seedUser(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)

  // The session is dead server-side, not just client-side: a fresh deep link
  // must bounce back to login.
  await page.goto('/accounts')
  await expect(page).toHaveURL(/\/login/)
})

test('invalid credentials show an inline error, stay on login', async ({
  page,
}) => {
  const email = uniqueEmail('badcreds')
  await seedUser(email, PASSWORD)

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('wrong-password-entirely')
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('the session survives a reload', async ({ page }) => {
  const email = uniqueEmail('persist')
  await seedUser(email, PASSWORD, [
    { kind: 'asset', label: 'House', currency: 'USD' },
  ])

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.reload()
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.getByText('House')).toBeVisible()
})

test('a stale CSRF cookie self-heals instead of failing the form', async ({
  page,
  context,
}) => {
  // The backend's dev secret is per-process: a restart invalidates every
  // in-flight csrftoken. Simulate a browser that lived through one.
  await context.addCookies([
    {
      name: 'csrftoken',
      value: 'stale-token-from-a-dead-process',
      url: 'http://localhost:5183',
    },
  ])

  const email = uniqueEmail('stalecsrf')
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/accounts$/)
})

test('a session revoked server-side bounces to login when the tab refocuses', async ({
  page,
}) => {
  const email = uniqueEmail('miduse')
  await seedUser(email, PASSWORD)

  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // The session dies out from under the open tab. Returning to the tab
  // refetches (React Query focus behavior); the dead session's 401 must land
  // on login — the global handler, not the route guard, owns this path.
  await revokeOtherSessions(email, PASSWORD)
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
  await expect(page).toHaveURL(/\/login/)
})
