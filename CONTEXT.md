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

**Profile menu**:
The popout anchored on the sidebar's user row: identity header, the Settings
entry, the theme control, Log out. Account-scoped chrome only — nothing
destructive lives here.
_Avoid_: account menu (Account is a financial term in Pinch), user menu, avatar dropdown

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

**Penny (screen)**:
The chat surface — a full route, not an overlay — where the user converses
with Penny over the ledger. Holds one Conversation at a time; New chat and
History are its only top-bar verbs. Present even when Penny is not
configured (the screen explains, rather than the nav hiding her).
_Avoid_: chat page, assistant panel, copilot

**Conversation**:
The persisted unit of chat, defined in `pinch-backend/CONTEXT.md` and
canonical here. Surface-side: a Conversation is addressable by URL, titled
by its first user message, and clients contribute new messages — never
rewrite history.
_Avoid_: thread, session

**Approval card**:
The in-conversation consent surface for one Penny write: names the action in
ledger terms, offers Approve / Deny. An approval left unanswered (e.g.
across a reload) renders as expired — muted, "not applied", never
re-actionable.
_Avoid_: confirmation dialog (it is in-flow, not modal)

**Tool chip**:
The collapsed in-conversation trace of one Penny read — what she looked at
to ground a reply ("Read spending report · June"), expandable to the raw
call. Honesty UI, not decoration: every read Penny makes is visible.
_Avoid_: tool call (the wire term), activity log

**Categories & Rules (surface)**:
The Setup surface for the taxonomy — one page, four tab routes: Categories
(the tree, with identity and spend), Rules (the law, plus Penny's suggested
rules), Tags, and Learning. New/edit category is a dialog; the rule builder
is its own route.
_Avoid_: taxonomy page, category settings

**Rule builder**:
The route where a rule is authored or edited: conditions, actions, a live
preview of matches, and — at creation only — the retro-apply tiers
(defined in `pinch-backend/CONTEXT.md`).
_Avoid_: rule modal, rule form

**Learning (tab)**:
The read-only rendering of the correction log and its stats — the flywheel
made visible. No verbs: recovery from any decision is editing the
transaction again, never an undo.
_Avoid_: history tab, activity feed
