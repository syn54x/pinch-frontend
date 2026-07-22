# Pinch Web App — Surface Language

Glossary for the Pinch web frontend. The *domain* language — Transaction,
Proposal, Provenance, Ledger, Transfer, Split line, and the rest — is defined
in `pinch-backend/CONTEXT.md` and is canonical here too; never redefine those
terms. This file adds the frontend's own vocabulary: the surfaces users see.
User-facing labels (nav items, headings) match the canonical terms — a label
that drifts from its term is a bug unless recorded here as a deliberate
exception.

## Surfaces

**Register**:
The surface for finding and inspecting money movement: the transaction list
plus the grammar around it — filtering, account scoping, and per-transaction
inspection. A read surface: review verbs live in the Inbox, even when reached
from a Register row.
_Avoid_: ledger (the screen sense — a Ledger is the tenancy unit), transactions page

**Inbox**:
The surface for review — accepting or correcting the proposals on incoming
transactions.
_Avoid_: review queue

**App shell**:
The persistent chrome every authed surface mounts inside: the sidebar (nav
with live Inbox count, Setup section, Penny pill, user row) and the top bar
(screen title, search, Ask Penny). Nav shows only surfaces that exist — no
disabled destinations.
_Avoid_: layout, frame

**Inspector**:
The detail pane beside a list surface (Inbox, Register) where one
transaction is examined and edited in place — category, tags, notes, split
lines. In the Inbox it also carries the review verbs.
_Avoid_: detail view, side panel

**Onboarding**:
The first-run wizard — primary currency, first account (connect or manual,
skippable), first sync — shown when the ledger has no accounts and no
connections. Ends by landing in a full Inbox, never an empty app.
_Avoid_: setup wizard, welcome flow
