# Review is a filter on the Register, not a place

The Inbox route is deleted (F10 CP1, PRD #79). The Register is the one surface for money movement, in three URL-backed views — **All**, **To review · N**, **Uncategorized** — and the entire review kit (day groups, accept-day headers, transfer pair callouts, the J/K/A/⇧A/C/S/T keyboard, the visible legend) lives in the To-review view. `/inbox` remains only as a permanent client-side redirect to `/register?view=review`; the nav's live unreviewed-count pill moves to the Register item; the Dashboard's review CTA and first-run onboarding land on the To-review view.

Three rules make the consolidation coherent:

- **The inspector's mode follows the transaction, not the door** (F10 CP0, #86). One shared inspector everywhere: an unreviewed transaction opens in the reviewing variant (staged corrections, Apply-to, the Accept footer) whether it was reached from the All tab, the To-review tab, or the Dashboard's Fix drawer; a reviewed transaction opens edit-in-place with no accept ritual.
- **To-review is the pure queue.** The filter bar is hidden on the To-review view, and any filter params in the URL are preserved but inert until the user switches to All or Uncategorized. Filters composing into the queue was considered and rejected: every batch-accept semantic (accept-day, accept-all, count-matches-list, pair callouts whose other leg must be in the same list) would need re-deriving under arbitrary filtering — a rewrite wearing a migration's clothes.
- **The queue keyboard kit is exclusive to the To-review view.** J/K/A/⇧A and accept-day mount only with the queue; on All and Uncategorized the same verbs are reachable through the inspector's buttons, not global keys, so browsing surfaces never swallow typing.

## The rejected alternative

Keeping a dedicated review surface (the Inbox as its own route and nav item) was the shipped design from F3 through F9, and it worked. The wireframes rejected it because it makes one list into two places: the same transaction is "in the Inbox" and "in the Register" simultaneously, the nav needs two entries for one job, deep links split (which door did you mean?), and every cross-surface affordance (the Register's old "unreviewed → open the Inbox" hop, the Dashboard CTA choosing a destination) exists only to stitch the split back together. A filter on one surface deletes the stitching instead of maintaining it.

## Consequences

- Reviewing and browsing share one address grammar: the queue is linkable (`/register?view=review`), and "review this" never navigates away from the ledger.
- The Uncategorized view gives reviewed-but-uncategorized rows (auto-filed imports, category-less reviews) a permanent landing, through the shared filter bar.
- "Inbox" is retired from the product vocabulary (CONTEXT.md); the term survives only in history (git, old issues) and in this ADR's account of what was deleted.
- Anything that wants to compose filters with the queue (e.g. "review only this account") is a new decision that must confront the batch-semantics question this ADR declined — not a small UI toggle.
