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
The one surface for money movement, in three URL-backed views: All (the
transaction list plus the find-grammar — filtering, account scoping, text
search), To review · N (the pure queue — day groups, accept-day, pair
callouts, the queue keyboard kit and its legend; the filter bar hides and
filter params sit inert), and Uncategorized (reviewed rows still missing a
category, through the shared filter bar). Its Inspector's mode follows the
transaction (see Inspector). Review is a filter on the Register, not a
place — ADR 0002.
_Avoid_: ledger (the screen sense — a Ledger is the tenancy unit),
transactions page, inbox (retired — the Inbox route died with F10 CP1; its
review kit lives in the To-review view)

**CSV import wizard**:
Entered from the Register toolbar (between Export and + Add): upload
(manual accounts only) → confirm or correct the suggested column mapping,
skipped when a saved import profile matches (its mapping is shown, not
hidden) → row preview with the duplicate flag, excluded by default with a
per-row override → commit, with auto-file exposed as a toggle defaulted on.
Import, import profile, auto-file, and duplicate flag are canonical domain
terms (`pinch-backend/CONTEXT.md`); this wizard is the surface that drives
them. Completion reports how many rows still lack a category and links to
the Register's Uncategorized view.
_Avoid_: CSV upload, file import (Import is the domain noun)

**App shell**:
The persistent chrome every authed surface mounts inside: the sidebar and
the top bar (screen title, global search, Ask Penny). Theme and logout live
in the profile menu, not the bar. The sidebar's nav reads Dashboard ·
Register (with the live unreviewed-count pill) · Recurring · Accounts ·
Categories & Rules · Connections — no disabled destinations, no "Setup"
grouping (retired F10 CP3). Below the nav, **Your money** lists the ledger's
accounts in collapsible Cash / Investments / Property / Debt groups (kind
mapping: depository → Cash, investment → Investments, asset → Property,
credit + loan → Debt), reading the net-worth report rather than the plain
accounts list so group totals are real primary-currency sums; an account the
report excludes for lack of an FX path still renders in its group at its own
native balance, held out of the total. Collapse state persists per device;
group totals stay visible collapsed. The account list scrolls inside the
sidebar — the Penny pill and profile block on the user row stay pinned
below it, never scrolling away.
_Avoid_: layout, frame

**Profile menu**:
The popout anchored on the sidebar's user row: identity header, the Settings
entry, the theme control, Log out. Account-scoped chrome only — nothing
destructive lives here.
_Avoid_: account menu (Account is a financial term in Pinch), user menu, avatar dropdown

**Settings**:
The account-configuration surface behind the profile menu — deep-linkable
panes (Profile, Preferences, Security, Developer API) for what you visit
twice a year. Never in the Setup nav: Setup holds surfaces you work in;
Settings is configuration about the account itself.
_Avoid_: account settings (Account is a financial term), preferences page
(Preferences is one pane of it)

**Inspector**:
The detail pane beside the Register's list views and queue — and inside the
Dashboard's Fix drawer — where one transaction is examined. One shared
component whose mode follows the transaction, not the surface it opened
from: an unreviewed transaction shows the reviewing variant (staged
corrections, Apply-to, the accept verbs in the footer); a reviewed one shows
the browsing variant (category, tags, notes, display name edited in place —
no accept ritual).
_Avoid_: detail view, side panel

**Onboarding**:
The first-run wizard — primary currency, first account (connect or manual,
skippable), first sync — shown on the Register when the ledger has no
accounts and no connections. Ends by landing on the Register's To-review
tab with synced history waiting, never an empty app.
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
