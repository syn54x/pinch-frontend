import type {
  CategoryRef,
  RetroApplyTier,
  ReviewIn,
  TransactionOut,
} from '@/api/generated/types.gen'

// The review domain, as pure values — shared by the reviewer panel, the
// controller hook, and the queue row. No React, no queries: staging shapes and
// the two functions that turn a staged decision into the one-shot review body.

/** Staged corrections for the focused transaction. An absent field means "the
 * proposal's value" — exactly the review contract's field-present merge.
 * (`category` keeps the full ref so the staged pill can render.) */
export interface Correction {
  category?: CategoryRef
  tags?: string[]
  /** #63 (wireframe 8b): "All from <payee> — make a rule" staged alongside
   * the category. Present = mint a payee-equals rule on Accept with this
   * retro tier (forward is the Inspector's conservative default — "two
   * clicks to touch history, one to not"). Never sent in the review body —
   * the rule is its own POST, consented by the same Accept. */
  ruleScope?: RetroApplyTier
}

/** Which correction affordance is open in the reviewer: the category picker
 * (C), the split editor (S), or the manual transfer picker (T on a row with
 * no detected pairing). Transfer CONSENT stays inline buttons, not a panel. */
export type ReviewPanel = 'category' | 'split' | 'transfer' | 'create-category'

export function payeeOf(txn: TransactionOut): string {
  return txn.proposal?.display_name ?? txn.display_name ?? txn.description_raw
}

/** The one-shot review body: null accepts as-is; staged corrections ride the
 * same single call (field-present merge, reviews API). A staged split document
 * is the decision shape and displaces a staged category (the API's exclusivity,
 * 422) — tags still ride along. */
export function reviewBody(
  correction: Correction,
  splits: ReviewIn['splits'] | null,
): ReviewIn | null {
  if (
    splits == null &&
    correction.category === undefined &&
    correction.tags === undefined
  ) {
    return null
  }
  const body: ReviewIn = {}
  if (splits != null) body.splits = splits
  else if (correction.category !== undefined) {
    body.category_id = correction.category.id
  }
  if (correction.tags !== undefined) body.tags = correction.tags
  return body
}

/** Whether this review consumes another queue row too. An explicit counterpart
 * decision consumes that row (proposal or not — the backend reviews both sides
 * at depth 2). On a detected pairing, plain accept IS the consent and consumes
 * the proposed mirror; any other positive decision (category, splits,
 * untracked) reviews one side — for a det row that is the DECLINE, and the
 * mirror is withdrawn. */
export function consumesCounterpart(
  txn: TransactionOut | undefined,
  body: ReviewIn | null,
): string | null {
  if (body?.transfer?.counterpart != null) return body.transfer.counterpart
  if (body !== null) return null
  const proposal = txn?.proposal
  if (proposal?.proposed_transfer !== true) return null
  return proposal.counterpart_transaction_id ?? null
}

/** Queue rows the backend would accept as this row's linked counterpart —
 * mirror of `establish_transfer`'s 422/409 gates so the picker never offers a
 * link the API rejects: equal magnitude, opposite sign, same currency,
 * different account, not a split member, not already in a transfer. Sorted by
 * date proximity to the focused row. (The detector needs mutual uniqueness and
 * a ±5-day window on top of these; the manual verb exists precisely for the
 * pairs it therefore abstains on.) */
export function transferCandidates(
  txn: TransactionOut,
  queue: Iterable<TransactionOut>,
): TransactionOut[] {
  const focusTime = Date.parse(txn.date)
  return [...queue]
    .filter(
      (candidate) =>
        candidate.id !== txn.id &&
        candidate.account_id !== txn.account_id &&
        candidate.currency === txn.currency &&
        candidate.amount_minor === -txn.amount_minor &&
        (candidate.splits === null || candidate.splits.length === 0) &&
        candidate.transfer === null,
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.date) - focusTime) -
        Math.abs(Date.parse(b.date) - focusTime),
    )
}
