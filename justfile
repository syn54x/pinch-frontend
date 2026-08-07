# Pinch frontend — mirrors pinch-backend's justfile conventions.

default:
    @just --list

# Install dependencies.
setup:
    pnpm install

# Run the dev server (backend must be running for real data). Serves
# https://localhost:5173 — Plaid's production OAuth redirect demands an
# https URI, and the backend's CORS origin follows suit, so plain-http
# `pnpm dev` no longer pairs with a local backend. The e2e stacks stay
# http on their own ports (Playwright starts Vite itself, sans VITE_HTTPS).
dev:
    pnpm dev:https

# Lint + format check + typecheck.
check:
    pnpm exec biome check .
    pnpm exec tsc -b

# Verify the generated client matches the committed openapi.json snapshot.
# (Full snapshot-vs-backend freshness is CP4's cross-repo job.)
check-drift:
    pnpm exec openapi-ts
    git add -N src/api/generated
    git diff --exit-code src/api/generated

# Auto-fix lint/format issues.
fix:
    pnpm exec biome check --write .

# Unit/component tests (Vitest). Quiet in F1 by design.
test *args:
    pnpm exec vitest run {{ args }}

# End-to-end tests against a real backend (see e2e/README once it exists).
# Runs every project: hermetic + the live Plaid/MX sandbox family + noai.
e2e *args:
    pnpm exec playwright test {{ args }}

# The hermetic e2e project only — the sub-minute gate for feature work.
# Skips the live Plaid/MX sandbox specs (wait-bound, run-varying) and the
# noai stack boot; run plain `just e2e` for the full pre-merge gate.
e2e-fast *args:
    pnpm exec playwright test --project=chromium {{ args }}

# Stand up the backend for e2e on a fresh database. The Playwright config
# runs this as a webServer; the schema arrives via the backend's
# auto-migrate-on-connect (its ADR-0002). Breach checking is disabled so
# the suite never touches the network. db mode: "docker" resets through the
# local-pg container (dev), "direct" through psql (CI's service container).
# Two processes, the backend's deployment shape: the API server plus the
# Procrastinate worker (syncs are background jobs). The worker starts only
# after the server passes health, so concurrent first-migrations never race;
# it dies with the recipe via the EXIT trap when Playwright tears down.
# All three AI knobs are pinned (F6 CP0): chat runs pydantic-ai's keyless
# deterministic `test` model; categorization and mapping are explicitly
# EMPTY — the backend loads its .env with override=False, so an unset knob
# would inherit a developer's real model + key and the classification sweep
# would make live LLM calls mid-suite (real money, nondeterministic inbox).
# PINCH_ENV is pinned to local for the same hermeticity (backend PR #94):
# the backend reads .env.local no matter what the invoking shell exports —
# a shell that inherited prod env once sent production Plaid creds here.
#
# port/frontend_port/dbname/logfile default to slot 0's values (see
# e2e/helpers/slot.ts) so direct CLI use is unchanged; playwright.config.ts
# passes the E2E_SLOT-derived values explicitly for every run it drives.
#
# The guard below is same-SLOT exclusivity, not cross-slot locking: two
# different slots never touch each other, but two runs racing the SAME
# slot would otherwise have the second run's db-reset DROP the first run's
# live database out from under it before either process ever fails on the
# port bind. Failing fast on a listening port stops that before anything
# is touched.
e2e-backend backend="../pinch-backend" db="docker" port="8100" frontend_port="5183" dbname="pinch_e2e" logfile="backend.log":
    if lsof -nP -iTCP:{{ port }} -sTCP:LISTEN >/dev/null 2>&1; then echo "port {{ port }} busy — another e2e run on this slot? pick a different E2E_SLOT" >&2; exit 1; fi
    just _e2e-db-reset-{{ db }} {{ dbname }}
    mkdir -p test-results
    cd {{ backend }} && \
      PINCH_ENV=local \
      PINCH_DATABASE_URL=postgres://postgres:password@localhost:5432/{{ dbname }} \
      PINCH_PLAID_WEBHOOK_URL=https://e2e.invalid/webhooks/plaid \
      PINCH_MX_WEBHOOK_SECRET=e2e-only-not-a-secret \
      PINCH_FRONTEND_BASE_URL=http://localhost:{{ frontend_port }} \
      PINCH_BREACH_CHECK_ENABLED=false \
      PINCH_AI_CHAT_MODEL=test \
      PINCH_AI_CATEGORIZATION_MODEL= \
      PINCH_AI_MAPPING_MODEL= \
      PINCH_AUTH_RATE_LIMIT_PER_IP=100000 \
      PINCH_SECRET_KEY=e2e-only-not-a-secret \
      PINCH_SECRET_ENCRYPTION_KEY=0fgqNJQuqR09ILyfU1jynGBXmn3_6a_h-8iLItevJXk= \
      PYTHONUNBUFFERED=1 \
      sh -c '(until curl -sf http://localhost:{{ port }}/health >/dev/null 2>&1; do sleep 0.5; done; echo "[e2e-harness] server healthy, starting worker"; exec uv run python -m pinch_backend.cli.app worker) & worker_waiter=$!; trap "kill $worker_waiter 2>/dev/null" EXIT; uv run litestar --app pinch_backend.api.app:app run --port {{ port }}' 2>&1 \
      | tee {{ justfile_directory() }}/test-results/{{ logfile }}

# The Penny-unavailable stack (F6 CP1): the same backend with NO chat model,
# on its own port and database, so the disabled state is the real backend
# saying no — not a mock. No worker: nothing on this stack syncs.
e2e-backend-noai backend="../pinch-backend" db="docker" port="8101" frontend_port="5184" dbname="pinch_e2e_noai" logfile="backend-noai.log":
    if lsof -nP -iTCP:{{ port }} -sTCP:LISTEN >/dev/null 2>&1; then echo "port {{ port }} busy — another e2e run on this slot? pick a different E2E_SLOT" >&2; exit 1; fi
    just _e2e-db-reset-{{ db }} {{ dbname }}
    mkdir -p test-results
    cd {{ backend }} && \
      PINCH_ENV=local \
      PINCH_DATABASE_URL=postgres://postgres:password@localhost:5432/{{ dbname }} \
      PINCH_PLAID_WEBHOOK_URL=https://e2e.invalid/webhooks/plaid \
      PINCH_MX_WEBHOOK_SECRET=e2e-only-not-a-secret \
      PINCH_FRONTEND_BASE_URL=http://localhost:{{ frontend_port }} \
      PINCH_BREACH_CHECK_ENABLED=false \
      PINCH_AI_CHAT_MODEL= \
      PINCH_AI_CATEGORIZATION_MODEL= \
      PINCH_AI_MAPPING_MODEL= \
      PINCH_AUTH_RATE_LIMIT_PER_IP=100000 \
      PINCH_SECRET_KEY=e2e-only-not-a-secret \
      PINCH_SECRET_ENCRYPTION_KEY=0fgqNJQuqR09ILyfU1jynGBXmn3_6a_h-8iLItevJXk= \
      PYTHONUNBUFFERED=1 \
      uv run litestar --app pinch_backend.api.app:app run --port {{ port }} 2>&1 \
      | tee {{ justfile_directory() }}/test-results/{{ logfile }}

# dbname defaults to slot 0's pinch_e2e; e2e-backend/-noai pass the
# E2E_SLOT-derived name (pinch_e2e_sN / pinch_e2e_noai_sN) explicitly.
_e2e-db-reset-docker dbname="pinch_e2e":
    docker exec local-pg psql -U postgres -c 'DROP DATABASE IF EXISTS {{ dbname }}' -c 'CREATE DATABASE {{ dbname }}'

_e2e-db-reset-direct dbname="pinch_e2e":
    PGPASSWORD=password psql -h localhost -U postgres -c 'DROP DATABASE IF EXISTS {{ dbname }}' -c 'CREATE DATABASE {{ dbname }}'

# Re-export the backend's OpenAPI schema and regenerate the typed client.
# The committed openapi.json snapshot is the contract seam between the repos:
# API changes surface here as reviewable diffs, and CI fails on drift.
openapi-sync backend="../pinch-backend":
    just -f {{ backend }}/justfile -d {{ backend }} openapi {{ justfile_directory() }}/openapi.json
    pnpm exec openapi-ts
