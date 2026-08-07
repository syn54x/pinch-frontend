import type { TransactionOut } from '@/api/generated/types.gen'
import { ReviewerPanel } from '@/components/review/reviewer-panel'
import type { useReviewController } from '@/components/review/use-review-controller'
import { BrowsingPanel } from './browsing-panel'

// The one inspector (F10 CP0, wireframe s7c "Inspector — states (one shared
// component)"): mode follows the TRANSACTION, not the door. An unreviewed
// transaction gets the reviewing variant — staged corrections, accept verbs
// in the footer — wherever it opens (Register pane, To-review tab, Dashboard Fix
// drawer). A reviewed transaction gets the browsing variant: edit-in-place,
// no accept ritual. Hosts own the queue/focus and feed a review controller;
// they mount THIS component, never a variant directly.
export function TransactionInspector({
  txn,
  reviewer,
}: {
  txn: TransactionOut
  reviewer: ReturnType<typeof useReviewController>
}) {
  if (txn.reviewed_at === null) {
    return <ReviewerPanel txn={txn} reviewer={reviewer} />
  }
  return <BrowsingPanel txn={txn} />
}
