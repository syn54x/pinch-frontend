import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F6 CP1 (issue #47): the keyless/disabled gate, against a REAL backend
// with no chat model configured (the chromium-noai project: backend 8101,
// frontend 5184). Absence reads as configuration, not breakage — the
// screen exists, explains itself with the server's own reason, and the
// composer takes no input.

const NOAI_API = 'http://localhost:8101'

test('an unconfigured server renders the explanatory disabled state', async ({
  page,
}) => {
  const email = uniqueEmail('penny-noai')
  await seedUser(email, PASSWORD, [], NOAI_API)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/penny')
  await expect(page.getByRole('heading', { name: 'Penny' })).toBeVisible()

  // The screen explains: the server's own display-safe reason, verbatim.
  const state = page.getByTestId('penny-unavailable')
  await expect(state).toBeVisible()
  await expect(state).toContainText("Penny isn't configured on this server")
  await expect(state).toContainText('PINCH_AI_CHAT_MODEL')

  // No way to type at her, no suggestion chips promising otherwise.
  await expect(page.getByPlaceholder(/ask penny/i)).toHaveCount(0)
  await expect(page.getByTestId('suggestion-chip')).toHaveCount(0)
})
