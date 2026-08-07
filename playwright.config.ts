import { defineConfig, devices } from '@playwright/test'
import {
  BACKEND_LOG,
  BACKEND_PORT,
  BACKEND_URL,
  DB_NAME,
  NOAI_BACKEND_LOG,
  NOAI_BACKEND_PORT,
  NOAI_BACKEND_URL,
  NOAI_DB_NAME,
  NOAI_VITE_PORT,
  NOAI_VITE_URL,
  VITE_PORT,
  VITE_URL,
} from './e2e/helpers/slot.ts'

// E2e against the real stack: Vite dev server + backend on a fresh database
// (see `just e2e-backend`). This suite is F1's definition of done — it proves
// the pipe, not a mock of it.
//
// Dedicated ports (backend 8100, frontend 5183) so the suite never collides
// with — or worse, reuses — a developer's live servers on 8000/5173. E2E_SLOT
// (see e2e/helpers/slot.ts) shifts all four ports and the e2e database names
// together so independent worktrees can run concurrently; slot 0 (unset) is
// identical to the ports/names above.
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

// Boot the noai stack (backend 8101 + vite 5184, both shifted by E2E_SLOT
// like every other port here; its own database reset) only when this run
// can reach the chromium-noai project — an explicit --project filter that
// excludes it skips two server boots.
const argv = process.argv.join(' ')
const wantsNoai = !argv.includes('--project') || argv.includes('chromium-noai')

// just's CLI only accepts positional recipe arguments — `just recipe
// b=1 a=2` passes the literal strings "b=1"/"a=2" positionally, it does
// not parse `key=value` as named args (that syntax only works recipe-to-
// recipe inside a justfile). So the justfile's e2e-backend/-noai
// parameter order (backend db port frontend_port dbname logfile) has to
// stay in sync with this call by hand — centralized here as the one place
// it's built, with named properties at every call site, so a future
// reorder shows up as an object-key change instead of a silent positional
// swap.
function e2eBackendCommand(
  recipe: 'e2e-backend' | 'e2e-backend-noai',
  args: {
    backendDir: string
    dbMode: string
    port: number
    frontendPort: number
    dbName: string
    logFile: string
  },
): string {
  return `just ${recipe} ${args.backendDir} ${args.dbMode} ${args.port} ${args.frontendPort} ${args.dbName} ${args.logFile}`
}

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
    baseURL: VITE_URL,
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
    // (port 8101 → frontend 5184, both shifted by E2E_SLOT). The disabled
    // state is asserted against the real backend refusing, never a mocked
    // status.
    {
      name: 'chromium-noai',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: NOAI_VITE_URL,
      },
      testMatch: /penny-unavailable/,
    },
  ],
  webServer: [
    {
      // CI overrides both: the pinned backend checkout lives inside the
      // workspace and the Postgres service is reachable directly. The
      // trailing args (port, vite port, db name, log filename) are the
      // slot-derived values from e2e/helpers/slot.ts.
      command: e2eBackendCommand('e2e-backend', {
        backendDir: process.env.E2E_BACKEND_DIR ?? '../pinch-backend',
        dbMode: process.env.E2E_DB_MODE ?? 'docker',
        port: BACKEND_PORT,
        frontendPort: VITE_PORT,
        dbName: DB_NAME,
        logFile: BACKEND_LOG,
      }),
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --port ${VITE_PORT} --strictPort`,
      url: VITE_URL,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_BASE_URL: BACKEND_URL },
    },
    ...(wantsNoai
      ? [
          {
            command: e2eBackendCommand('e2e-backend-noai', {
              backendDir: process.env.E2E_BACKEND_DIR ?? '../pinch-backend',
              dbMode: process.env.E2E_DB_MODE ?? 'docker',
              port: NOAI_BACKEND_PORT,
              frontendPort: NOAI_VITE_PORT,
              dbName: NOAI_DB_NAME,
              logFile: NOAI_BACKEND_LOG,
            }),
            url: `${NOAI_BACKEND_URL}/health`,
            reuseExistingServer: false,
            timeout: 120_000,
          },
          {
            command: `pnpm dev --port ${NOAI_VITE_PORT} --strictPort`,
            url: NOAI_VITE_URL,
            reuseExistingServer: false,
            timeout: 30_000,
            env: { VITE_API_BASE_URL: NOAI_BACKEND_URL },
          },
        ]
      : []),
  ],
})
