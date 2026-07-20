import { defineConfig, devices } from '@playwright/test'

// E2e against the real stack: Vite dev server + backend on a fresh database
// (see `just e2e-backend`). This suite is F1's definition of done — it proves
// the pipe, not a mock of it.
//
// Dedicated ports (backend 8100, frontend 5183) so the suite never collides
// with — or worse, reuses — a developer's live servers on 8000/5173.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
  ],
})
