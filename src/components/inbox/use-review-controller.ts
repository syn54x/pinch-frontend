import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import {
  countUnreviewedTransactionsQueryKey,
  getTransactionOptions,
  listCategoriesOptions,
  listTagsOptions,
  listTransactionsQueryKey,
  reviewTransactionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { ReviewIn, TransactionOut } from '@/api/generated/types.gen'
import {
  initialSplitDraft,
  type SplitDraftLine,
  splitStatus,
  splitsForReview,
} from '@/lib/split-draft'
import {
  type Correction,
  consumesCounterpart,
  payeeOf,
  type ReviewPanel,
  reviewBody,
} from './reviewer-model'

/** A review changes the transaction lists (Inbox and Register) and the count.
 * Base keys match every variant (partial key matching), so all re-ask. */
export function invalidateReviewData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
  queryClient.invalidateQueries({
    queryKey: countUnreviewedTransactionsQueryKey(),
  })
}

interface UseReviewControllerArgs {
  /** The transaction under review — null when the host has nothing focused. */
  txn: TransactionOut | null
  /** In-queue transactions by id — resolves a detected pair's other leg
   * without a fetch when it's still in the host's queue. */
  queueById: Map<string, TransactionOut>
  /** Names a transaction's account for the pair callout; falls back to payee. */
  accountLabel: (accountId: string) => string | undefined
  /** A review is in flight outside this controller (e.g. the host's batch
   * accept) — the panel's verbs disable too. */
  externalBusy?: boolean
  /** Rows left the queue: the reviewed txn, plus a consumed counterpart. The
   * host does its own list bookkeeping (remove / advance). */
  onReviewed: (ids: string[]) => void
  /** Hand the keyboard back after a panel closes (the host's focus target). */
  onReturnFocus?: () => void
}

// The reviewer's orchestration, lifted out of the Inbox page so any host (the
// Inbox pane, the Dashboard Fix drawer) can mount the same reviewer: it owns
// correction staging, the category/split panel, the split draft, the
// transfer-counterpart lookup, and the accept mutation + invalidations. The
// host owns the queue, focus, and list bookkeeping and feeds `txn` + `onReviewed`.
export function useReviewController({
  txn,
  queueById,
  accountLabel,
  externalBusy = false,
  onReviewed,
  onReturnFocus,
}: UseReviewControllerArgs) {
  const queryClient = useQueryClient()
  const txnId = txn?.id ?? null

  // Corrections and the split draft stage against ONE row (keyed by id) and
  // ride the accept call — returning to a row restores its staged edits.
  const [staged, setStaged] = useState<{
    id: string
    value: Correction
  } | null>(null)
  const [splitDraft, setSplitDraft] = useState<{
    id: string
    lines: SplitDraftLine[]
  } | null>(null)
  // What Cancel restores: the draft as it stood when this editing session
  // opened — null means the session started fresh (cancel un-splits).
  const [splitBaseline, setSplitBaseline] = useState<SplitDraftLine[] | null>(
    null,
  )
  const [panel, setPanel] = useState<ReviewPanel | null>(null)

  // A focus move (or loss) closes any open panel — a correction targets one
  // row; it never silently retargets another. Reset during render (React's
  // documented "adjust state when a prop changes" pattern) so there's no stale
  // frame. The staged correction/split persist keyed by id, so returning to a
  // row restores them.
  const [panelTxnId, setPanelTxnId] = useState(txnId)
  if (txnId !== panelTxnId) {
    setPanelTxnId(txnId)
    setPanel(null)
  }

  const correction: Correction =
    staged !== null && staged.id === txnId ? staged.value : {}
  const splitLines =
    splitDraft !== null && splitDraft.id === txnId ? splitDraft.lines : null
  const splitValid =
    splitLines === null ||
    txn === null ||
    splitStatus(splitLines, txn).valid === true

  const categories = useQuery({
    ...listCategoriesOptions({ query: { limit: 100 } }),
    enabled: panel === 'category' || panel === 'split',
  })
  const tags = useQuery({
    ...listTagsOptions({ query: { limit: 100 } }),
    enabled: txn !== null,
  })

  // The detected pair's other leg. Usually it sits in the host's queue; when
  // the counterpart was already reviewed (a proposal only mirrors on unreviewed
  // sides) it is fetched on demand.
  const counterpartId = txn?.proposal?.counterpart_transaction_id ?? null
  const counterpartFetch = useQuery({
    ...getTransactionOptions({ path: { txn_id: counterpartId ?? '' } }),
    enabled: counterpartId !== null && !queueById.has(counterpartId),
  })
  const counterpart =
    counterpartId !== null
      ? (queueById.get(counterpartId) ?? counterpartFetch.data ?? null)
      : null
  const counterpartLabel =
    counterpart !== null
      ? (accountLabel(counterpart.account_id) ?? payeeOf(counterpart))
      : null

  const review = useMutation({
    ...reviewTransactionMutation(),
    onSuccess: (_data, variables) => {
      // Consenting to a detected pair reviews BOTH sides in one act — the
      // mirror leaves the queue with it (backend consumes at depth 2).
      const cp = consumesCounterpart(
        queueById.get(variables.path.txn_id),
        variables.body ?? null,
      )
      onReviewed(
        cp !== null ? [variables.path.txn_id, cp] : [variables.path.txn_id],
      )
      invalidateReviewData(queryClient)
    },
    // Reality re-asserts (a 409 means the row is already reviewed).
    onError: () => invalidateReviewData(queryClient),
  })
  const busy = review.isPending || externalBusy

  function closePanel() {
    setPanel(null)
    onReturnFocus?.()
  }

  function setCorrection(value: Correction) {
    if (txn === null) return
    setStaged({ id: txn.id, value })
    // A staged category displaces a staged split — exclusive decision shapes,
    // the same law openSplit applies in reverse.
    if (value.category !== undefined) {
      setSplitDraft((prev) =>
        prev !== null && prev.id === txn.id ? null : prev,
      )
    }
  }

  function setSplitLines(lines: SplitDraftLine[]) {
    if (txn === null) return
    setSplitDraft({ id: txn.id, lines })
  }

  function accept() {
    if (txn === null || busy) return
    let splits: ReviewIn['splits'] | null = null
    if (splitLines !== null) {
      // The lines-vs-total guard: a mismatched document never reaches the
      // review call — A is inert until the lines balance (the cue says why).
      if (!splitStatus(splitLines, txn).valid) return
      splits = splitsForReview(splitLines, txn)
    }
    review.mutate({
      path: { txn_id: txn.id },
      body: reviewBody(correction, splits),
    })
  }

  /** T (or the Confirm button): consent to the detected pairing. Accepting the
   * det proposal as-is IS the consent shape — one empty-body review consumes
   * both sides. Staged corrections belong to the decline path. */
  function consentTransfer() {
    if (txn?.proposal?.proposed_transfer !== true || busy) return
    review.mutate({ path: { txn_id: txn.id }, body: null })
  }

  function openCategory() {
    setPanel('category')
  }

  function toggleCategory() {
    if (panel === 'category') closePanel()
    else setPanel('category')
  }

  /** S / Edit split: open the editor, drafting the document on first open. The
   * split displaces a staged category — decision shapes are exclusive (the
   * API's 422) — while staged tags survive to ride along. */
  function openSplit() {
    if (txn === null) return
    if (splitDraft === null || splitDraft.id !== txn.id) {
      setSplitDraft({ id: txn.id, lines: initialSplitDraft(txn) })
      setSplitBaseline(null)
      setStaged((prev) =>
        prev !== null && prev.id === txn.id
          ? { id: prev.id, value: { tags: prev.value.tags } }
          : prev,
      )
    } else {
      // Re-opening an already-staged document: Cancel restores this.
      setSplitBaseline(splitDraft.lines)
    }
    setPanel('split')
  }

  /** ↩ / Save split: the valid document stays staged; the editor closes back
   * to the resting summary — Accept sends it. */
  function saveSplit() {
    if (txn === null || splitLines === null) return
    if (!splitStatus(splitLines, txn).valid) return
    closePanel()
  }

  /** Escape / Cancel: discard this editing session's changes — back to the
   * document as it stood on open, or to unsplit for a fresh session. */
  function cancelSplit() {
    setSplitDraft((prev) => {
      if (prev === null || prev.id !== txnId) return prev
      return splitBaseline === null
        ? null
        : { id: prev.id, lines: splitBaseline }
    })
    closePanel()
  }

  /** Merge back (wireframe): the draft collapses to the single unsplit line —
   * a wrong split is reversible in place, nothing was sent. Also where ✕ lands
   * when it removes the last split line. */
  function mergeBack() {
    setSplitDraft((prev) => (prev !== null && prev.id === txnId ? null : prev))
    closePanel()
  }

  return {
    // state the reviewer panel renders
    correction,
    splitLines,
    panel,
    categories: categories.data?.items ?? [],
    categoriesPending: categories.isPending,
    tagSuggestions: tags.data?.items.map((tag) => tag.name) ?? [],
    counterpart,
    counterpartLabel,
    busy,
    splitValid,
    reviewError: review.isError ? review.error : null,
    canConsentTransfer: txn?.proposal?.proposed_transfer === true,
    // verbs
    setCorrection,
    setSplitLines,
    accept,
    consentTransfer,
    openCategory,
    closeCategory: closePanel,
    toggleCategory,
    openSplit,
    saveSplit,
    cancelSplit,
    mergeBack,
  }
}
