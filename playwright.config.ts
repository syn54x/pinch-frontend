import { defineConfig, devices } from '@playwright/test'

// E2e against the real stack: Vite dev server + backend on a fresh database
// (see `just e2e-backend`). This suite is F1's definition of done — it proves
// the pipe, not a mock of it.
//
// Dedicated ports (backend 8100, frontend 5183) so the suite never collides
// with — or worse, reuses — a developer's live servers on 8000/5173.
//
// Two speed decisions (measured 2026-08-07, when the serial suite hit 20m):
// - Tests run PARALLEL (4 workers locally): every spec seeds its own unique
//   user, so rows never collide across workers. File-level parallelism only
//   (fullyParallel stays off) — tests within a file keep their order.
// - The live Plaid/MX sandbox family is its own project (chromium-live):
//   those specs wait on real first syncs (~16 of the serial 20 minutes) and
//   fail run-varying with the sandboxes' weather. `just e2e` still runs
//   everything (~4–5m); `just e2e-fast` runs the hermetic project alone
//   (~1m) as the feature-work gate.

// The live family: every spec that drives a real Plaid or MX sandbox
// (seedSandboxConnection / waitForFirstSync / minted tokens / MX member
// polling). Matched by exact basename so e.g. register-review-deep
// (hermetic) never rides along with register-review (live).
const LIVE_SPECS =
  /(?:^|[/\\])(?:connect|connections|lifecycle|investments|mx-connect|mx-repair|oauth-return|provider-picker|onboarding-live|register-review|capability-gap)\.spec\.ts$/

// Boot the noai stack (backend 8101 + vite 5184, its own database reset)
// only when this run can reach the chromium-noai project — an explicit
// --project filter that excludes it skips two server boots.
const argv = process.argv.join(' ')
const wantsNoai = !argv.includes('--project') || argv.includes('chromium-noai')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  // One CI retry: the suite's single non-hermetic edge (Plaid's sandbox)
  // has shown transient NETWORK_ERRORs; our own regressions still fail
  // loudly locally where retries stay off.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
    // The money formatter renders in the runtime locale; the suite asserts
    // en-US strings, so make that contract explicit.
    locale: 'en-US',
  },
  projects: [
    {
      // The hermetic suite — everything that needs only the local stack.
      // `just e2e-fast` runs exactly this: the sub-minute feature gate.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [LIVE_SPECS, /penny-unavailable/],
    },
    {
      // The live Plaid/MX sandbox family — wait-bound and run-varying.
      name: 'chromium-live',
      use: { ...devices['Desktop Chrome'] },
      testMatch: LIVE_SPECS,
    },
    // The Penny-unavailable stack: same app, a backend with no chat model
    // (port 8101 → frontend 5184). The disabled state is asserted against
    // the real backend refusing, never a mocked status.
    {
      name: 'chromium-noai',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5184',
      },
      testMatch: /penny-unavailable/,
    },
  ],
  webServer: [
    {
      // CI overrides both: the pinned backend checkout lives inside the
      // workspace and the Postgres service is reachable directly.
      command: `just e2e-backend ${process.env.E2E_BACKEND_DIR ?? '../pinch-backend'} ${process.env.E2E_DB_MODE ?? 'docker'}`,
      url: 'http://localhost:8100/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev --port 5183 --strictPort',
      url: 'http://localhost:5183',
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_BASE_URL: 'http://localhost:8100' },
    },
    ...(wantsNoai
      ? [
          {
            command: `just e2e-backend-noai ${process.env.E2E_BACKEND_DIR ?? '../pinch-backend'} ${process.env.E2E_DB_MODE ?? 'docker'}`,
            url: 'http://localhost:8101/health',
            reuseExistingServer: false,
            timeout: 120_000,
          },
          {
            command: 'pnpm dev --port 5184 --strictPort',
            url: 'http://localhost:5184',
            reuseExistingServer: false,
            timeout: 30_000,
            env: { VITE_API_BASE_URL: 'http://localhost:8101' },
          },
        ]
      : []),
  ],
})
