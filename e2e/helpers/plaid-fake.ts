import type { Page } from '@playwright/test'

/** Serve the fake Plaid script (network-boundary mock) and arm its knobs.
 * `institution` rides onSuccess metadata — how a spec stages the dupe
 * guard's pre-exchange identity (7e) without any Plaid credentials. */
export async function armPlaidFake(
  page: Page,
  mode: 'success' | 'cancel' | 'error',
  publicToken?: string,
  institution?: { institution_id: string; name: string },
) {
  await page.route('**/link-initialize.js', (route) =>
    route.fulfill({
      path: 'e2e/fixtures/plaid-link.js',
      contentType: 'application/javascript',
    }),
  )
  await page.addInitScript(
    (knobs: {
      mode: 'success' | 'cancel' | 'error'
      token?: string
      institution?: { institution_id: string; name: string }
    }) => {
      window.__E2E_PLAID_MODE = knobs.mode
      window.__E2E_PLAID_PUBLIC_TOKEN = knobs.token
      window.__E2E_PLAID_INSTITUTION = knobs.institution
    },
    { mode, token: publicToken, institution },
  )
}
