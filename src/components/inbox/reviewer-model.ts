import type {
  CategoryRef,
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
}

/** Which correction affordance is open in the reviewer: the category picker
 * (C) or the split editor (S). Transfer consent is inline buttons, not a
 * panel. */
export type ReviewPanel = 'category' | 'split'

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

/** Whether this review consumes the detected counterpart too: consenting to the
 * pairing (plain accept or an explicit transfer decision) reviews both sides in
 * one act; any other positive decision (category, splits) is the DECLINE — it
 * reviews one side and withdraws the mirror. */
export function consumesCounterpart(
  txn: TransactionOut | undefined,
  body: ReviewIn | null,
): string | null {
  const proposal = txn?.proposal
  if (proposal?.proposed_transfer !== true) return null
  if (proposal.counterpart_transaction_id == null) return null
  const consent = body === null || body.transfer != null
  return consent ? proposal.counterpart_transaction_id : null
}
