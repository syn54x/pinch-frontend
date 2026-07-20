import type { Page } from '@playwright/test'

/** Serve the fake Plaid script (network-boundary mock) and arm its knobs. */
export async function armPlaidFake(
  page: Page,
  mode: 'success' | 'cancel' | 'error',
  publicToken?: string,
) {
  await page.route('**/link-initialize.js', (route) =>
    route.fulfill({
      path: 'e2e/fixtures/plaid-link.js',
      contentType: 'application/javascript',
    }),
  )
  await page.addInitScript(
    (knobs: { mode: 'success' | 'cancel' | 'error'; token?: string }) => {
      window.__E2E_PLAID_MODE = knobs.mode
      window.__E2E_PLAID_PUBLIC_TOKEN = knobs.token
    },
    { mode, token: publicToken },
  )
}
