import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'

// The MX widget fake at its network boundary: the backend mints a REAL
// widget URL on *.moneydesktop.com (int-widgets in sandbox); the route
// intercepts that document load inside the sheet's iframe and serves the
// fixture page instead, which postMessages the captured event sequence
// from the widget's own origin — the adapter's origin check stays honest.

const FIXTURE_URL = new URL('../fixtures/mx-connect.html', import.meta.url)

/** Intercept the MX Connect widget document and arm the fixture's knobs.
 * On success the fixture answers with `memberGuid` — a real API-seeded
 * sandbox member (see helpers/mx.ts), so the backend's verify-and-create
 * path runs against real MX responses. */
export async function armMxFake(
  page: Page,
  mode: 'success' | 'cancel' | 'error',
  memberGuid?: string,
) {
  const template = await readFile(FIXTURE_URL, 'utf8')
  const html = template.replaceAll(
    '__MX_FAKE_CONFIG__',
    JSON.stringify({ mode, memberGuid: memberGuid ?? 'MBR-e2e-fake' }),
  )
  await page.route(
    (url) => url.hostname.endsWith('.moneydesktop.com'),
    (route) =>
      route.request().resourceType() === 'document'
        ? route.fulfill({ body: html, contentType: 'text/html' })
        : route.fulfill({ status: 204, body: '' }),
  )
}
