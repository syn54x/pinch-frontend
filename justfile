# Pinch frontend — mirrors pinch-backend's justfile conventions.

default:
    @just --list

# Install dependencies.
setup:
    pnpm install

# Run the dev server (backend must be running for real data).
dev:
    pnpm dev

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
e2e *args:
    pnpm exec playwright test {{ args }}

# Stand up the backend for e2e on a fresh database. The Playwright config
# runs this as a webServer; the schema arrives via the backend's
# auto-migrate-on-connect (its ADR-0002). Breach checking is disabled so
# the suite never touches the network. db mode: "docker" resets through the
# local-pg container (dev), "direct" through psql (CI's service container).
# Two processes, the backend's deployment shape: the API server plus the
# Procrastinate worker (syncs are background jobs). The worker starts only
# after the server passes health, so concurrent first-migrations never race;
# it dies with the recipe via the EXIT trap when Playwright tears down.
e2e-backend backend="../pinch-backend" db="docker":
    just _e2e-db-reset-{{ db }}
    mkdir -p test-results
    cd {{ backend }} && \
      PINCH_DATABASE_URL=postgres://postgres:password@localhost:5432/pinch_e2e \
      PINCH_FRONTEND_BASE_URL=http://localhost:5183 \
      PINCH_BREACH_CHECK_ENABLED=false \
      PINCH_SECRET_KEY=e2e-only-not-a-secret \
      PINCH_SECRET_ENCRYPTION_KEY=0fgqNJQuqR09ILyfU1jynGBXmn3_6a_h-8iLItevJXk= \
      PYTHONUNBUFFERED=1 \
      sh -c '(until curl -sf http://localhost:8100/health >/dev/null 2>&1; do sleep 0.5; done; echo "[e2e-harness] server healthy, starting worker"; uv run python -m pinch_backend.cli.app worker; echo "[e2e-harness] worker exited: $?") & worker_waiter=$!; trap "kill $worker_waiter 2>/dev/null" EXIT; uv run litestar --app pinch_backend.api.app:app run --port 8100' 2>&1 \
      | tee {{ justfile_directory() }}/test-results/backend.log

e2e_db_reset_sql := "-c 'DROP DATABASE IF EXISTS pinch_e2e' -c 'CREATE DATABASE pinch_e2e'"

_e2e-db-reset-docker:
    docker exec local-pg psql -U postgres {{ e2e_db_reset_sql }}

_e2e-db-reset-direct:
    PGPASSWORD=password psql -h localhost -U postgres {{ e2e_db_reset_sql }}

# Re-export the backend's OpenAPI schema and regenerate the typed client.
# The committed openapi.json snapshot is the contract seam between the repos:
# API changes surface here as reviewable diffs, and CI fails on drift.
openapi-sync backend="../pinch-backend":
    just -f {{ backend }}/justfile -d {{ backend }} openapi {{ justfile_directory() }}/openapi.json
    pnpm exec openapi-ts
