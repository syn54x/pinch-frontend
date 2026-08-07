// E2E_SLOT partitions ports and databases so independent git worktrees can
// run the e2e suite concurrently without colliding: slot N shifts every
// port by 10*N and suffixes every e2e database name with _sN. Slot 0 (the
// default — no E2E_SLOT set) is byte-for-byte identical to the suite's
// pre-slot behavior: same ports (8100/8101/5183/5184), same database names
// (pinch_e2e/pinch_e2e_noai) — a lone developer or CI never notices this
// exists. This obsoletes the old machine-wide /private/tmp/pinch-e2e.lock
// convention for CROSS-slot concurrency: independent slots never need to
// coordinate. Two runs on the SAME slot still can't share a stack — that's
// enforced by a fail-fast port-busy guard at the top of the justfile's
// e2e-backend/-noai recipes (so a second same-slot run aborts before it
// can DROP the first run's live database), not by luck.
//
// Read once at module load so every consumer agrees on the same slot for
// the run's lifetime: playwright.config.ts (which shells out to the
// justfile recipes, passing the computed ports/db names as arguments), and
// the e2e helpers that run inside the Playwright process itself (api.ts,
// db.ts, seed.ts, and spec files that talk to a stack directly).

const MAX_SLOT = 999

function readSlot(): number {
  const raw = process.env.E2E_SLOT
  if (raw === undefined || raw === '') return 0
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `E2E_SLOT must be a non-negative integer, got ${JSON.stringify(raw)}`,
    )
  }
  const slot = Number(raw)
  // Caught here so a typo'd slot fails loudly at config load with this
  // message, instead of the port arithmetic quietly producing a port
  // above 65535 and failing deep inside a `listen` call.
  if (slot > MAX_SLOT) {
    throw new Error(`E2E_SLOT must be ${MAX_SLOT} or less, got ${slot}`)
  }
  return slot
}

export const SLOT = readSlot()

const shift = SLOT * 10

export const BACKEND_PORT = 8100 + shift
export const VITE_PORT = 5183 + shift
export const NOAI_BACKEND_PORT = 8101 + shift
export const NOAI_VITE_PORT = 5184 + shift

export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
export const VITE_URL = `http://localhost:${VITE_PORT}`
export const NOAI_BACKEND_URL = `http://localhost:${NOAI_BACKEND_PORT}`
export const NOAI_VITE_URL = `http://localhost:${NOAI_VITE_PORT}`

// Slot 0 keeps today's exact names; slot N>0 gets its own database so
// concurrent runs never share — or destructively DROP/CREATE — the same
// rows.
export const DB_NAME = SLOT === 0 ? 'pinch_e2e' : `pinch_e2e_s${SLOT}`
export const NOAI_DB_NAME =
  SLOT === 0 ? 'pinch_e2e_noai' : `pinch_e2e_noai_s${SLOT}`

// Distinct log filenames per slot so concurrent runs' `tee`d backend logs
// never interleave into the same file.
const logSuffix = SLOT === 0 ? '' : `-s${SLOT}`
export const BACKEND_LOG = `backend${logSuffix}.log`
export const NOAI_BACKEND_LOG = `backend-noai${logSuffix}.log`
