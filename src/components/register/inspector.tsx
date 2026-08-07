import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getTransactionOptions,
  getTransactionQueryKey,
  listAccountsOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { TransactionOut } from '@/api/generated/types.gen'
import { useReviewController } from '@/components/inbox/use-review-controller'
import { TransactionInspector } from '@/components/inspector/transaction-inspector'

// The Register's Inspector mount (CONTEXT.md): the pane beside the list where
// one transaction shows everything. It mounts the ONE inspector — mode
// follows the transaction (F10 CP0): a reviewed row edits in place, an
// unreviewed row shows the reviewing variant with its Accept footer, right
// here. This host owns the detail fetch and the review controller; accepting
// re-reads the row so the pane flips to browsing where it stands.

export function Inspector({
  txnId,
  seed,
  queueById,
}: {
  txnId: string | undefined
  /** The already-loaded list row, so selection paints instantly. */
  seed: TransactionOut | undefined
  /** Loaded UNREVIEWED rows by id — the reviewing variant's queue (pair
   * resolution, manual-transfer candidates). */
  queueById: Map<string, TransactionOut>
}) {
  return (
    <div
      data-testid="inspector"
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      {txnId ? (
        <InspectorBody
          key={txnId}
          txnId={txnId}
          seed={seed}
          queueById={queueById}
        />
      ) : (
        <div className="p-4">
          <div className="label-caps">Inspecting</div>
          <p className="mt-2 max-w-[36ch] text-muted-foreground text-sm">
            Select a transaction to see everything about it — and edit it in
            place.
          </p>
        </div>
      )}
    </div>
  )
}

function InspectorBody({
  txnId,
  seed,
  queueById,
}: {
  txnId: string
  seed: TransactionOut | undefined
  queueById: Map<string, TransactionOut>
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    ...getTransactionOptions({ path: { txn_id: txnId } }),
    // The seed is the same resource one hydration older — good enough to
    // paint with while the fresh read lands.
    placeholderData: seed,
    throwOnError: true,
  })
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const accountLabels = useMemo(
    () =>
      new Map(
        (accounts.data?.items ?? []).map((account) => [
          account.id,
          account.label,
        ]),
      ),
    [accounts.data],
  )

  const txn = detail.data ?? null
  const reviewer = useReviewController({
    // Mode follows the transaction: only an unreviewed row arms the reviewer.
    txn: txn !== null && txn.reviewed_at === null ? txn : null,
    queueById,
    accountLabel: (id) => accountLabels.get(id),
    onReviewed: (ids) => {
      // The controller refetches the lists and the count; this host re-reads
      // the decided row(s) so the pane flips to browsing in place.
      for (const id of ids) {
        queryClient.invalidateQueries({
          queryKey: getTransactionQueryKey({ path: { txn_id: id } }),
        })
      }
    },
  })

  if (txn === null) return <InspectorSkeleton />
  return <TransactionInspector txn={txn} reviewer={reviewer} />
}

function InspectorSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      <div className="label-caps">Inspecting</div>
      <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
      <div className="h-3 w-56 animate-pulse rounded-md bg-muted" />
    </div>
  )
}
