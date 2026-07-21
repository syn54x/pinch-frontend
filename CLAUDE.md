# Pinch Frontend

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `syn54x/pinch-frontend`, via the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary, default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design context

Read before any UI work:

- **`PRODUCT.md`** (repo root) — strategy: register, users, positioning ("Serious money intelligence, zero busywork"), brand personality, anti-references, design principles, accessibility bar.
- **`DESIGN.md`** (repo root) — visual system: color rules, typography, elevation, do's and don'ts. Currently a seed; tokens land as the identity is implemented. Its named rules (Chrome/Data, Cool Canvas, Three Themes, Tabular) are binding on all UI code.
