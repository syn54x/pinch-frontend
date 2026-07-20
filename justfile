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

# Stand up the backend for e2e on a fresh database (requires the local-pg
# docker container). The Playwright config runs this as a webServer; the
# schema arrives via the backend's auto-migrate-on-connect (its ADR-0002).
# Breach checking is disabled so the suite never touches the network.
e2e-backend backend="../pinch-backend":
    docker exec local-pg psql -U postgres -c 'DROP DATABASE IF EXISTS pinch_e2e' -c 'CREATE DATABASE pinch_e2e'
    cd {{ backend }} && \
      PINCH_DATABASE_URL=postgres://postgres:password@localhost:5432/pinch_e2e \
      PINCH_FRONTEND_BASE_URL=http://localhost:5183 \
      PINCH_BREACH_CHECK_ENABLED=false \
      PINCH_SECRET_KEY=e2e-only-not-a-secret \
      uv run litestar --app pinch_backend.api.app:app run --port 8100

# Re-export the backend's OpenAPI schema and regenerate the typed client.
# The committed openapi.json snapshot is the contract seam between the repos:
# API changes surface here as reviewable diffs, and CI fails on drift.
openapi-sync backend="../pinch-backend":
    just -f {{ backend }}/justfile -d {{ backend }} openapi {{ justfile_directory() }}/openapi.json
    pnpm exec openapi-ts
