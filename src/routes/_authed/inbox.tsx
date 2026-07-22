import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox as InboxIcon } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { errorDetail } from '@/api/client'
import {
  countUnreviewedTransactionsOptions,
  countUnreviewedTransactionsQueryKey,
  getTransactionOptions,
  listAccountsOptions,
  listCategoriesOptions,
  listConnectionsOptions,
  listTagsOptions,
  listTransactionsOptions,
  listTransactionsQueryKey,
  reviewBatchMutation,
  reviewTransactionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { ReviewIn, TransactionOut } from '@/api/generated/types.gen'
import { dayLabel } from '@/components/inbox/day-label'
import {
  type Correction,
  Inspector,
  payeeOf,
} from '@/components/inbox/inspector'
import { KeyboardLegend } from '@/components/inbox/keyboard-legend'
import { PairCallout } from '@/components/inbox/pair-callout'
import { ProposalRow, proposalRowDomId } from '@/components/inbox/proposal-row'
import {
  OnboardingWizard,
  onboardingSkippedThisLoad,
} from '@/components/onboarding/wizard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dayGroups, inboxReducer, initialInboxState } from '@/lib/inbox-reducer'
import {
  initialSplitDraft,
  type SplitDraftLine,
  splitStatus,
  splitsForReview,
} from '@/lib/split-draft'

export const Route = createFileRoute('/_authed/inbox')({
  staticData: { title: 'Inbox' },
  component: InboxPage,
})

// One page of queue at a time (the API cap). Reviews shrink the queue and
// every review invalidates the list, so deeper pages surface as the visible
// ones clear — the count above the fold always tells the whole truth.
const QUEUE_PAGE = 100

const queueOptions = () =>
  listTransactionsOptions({ query: { reviewed: false, limit: QUEUE_PAGE } })

/** The one-shot review body: null accepts as-is; staged corrections ride
 * the same single call (field-present merge, reviews API). A staged split
 * document is the decision shape and displaces a staged category (the API's
 * exclusivity, 422) — tags still ride along. */
function reviewBody(
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

/** Whether this review consumes the detected counterpart too: consenting to
 * the pairing (plain accept or an explicit transfer decision) reviews both
 * sides in one act; any other positive decision (category, splits) is the
 * DECLINE — it reviews one side and withdraws the mirror. */
function consumesCounterpart(
  txn: TransactionOut | undefined,
  body: ReviewIn | null,
): string | null {
  const proposal = txn?.proposal
  if (proposal?.proposed_transfer !== true) return null
  if (proposal.counterpart_transaction_id == null) return null
  const consent = body === null || body.transfer != null
  return consent ? proposal.counterpart_transaction_id : null
}

// F3 CP2 (#18, wireframe #7): the Inbox's core loop. Proposals grouped by
// day; accept one (A / the Inspector), a day, or all; correct category and
// tags before accepting through the same one-shot review call. Selection
// and keyboard live in the pure inbox reducer — this component dispatches
// and renders. Liveness is invalidation + refocus, never polling.
function InboxPage() {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(inboxReducer, initialInboxState)
  // Corrections stage against ONE row (keyed by id, so they die the moment
  // focus moves) and ride the accept call — never a separate save.
  const [staged, setStaged] = useState<{
    id: string
    value: Correction
  } | null>(null)
  // The split draft, staged the same way — one document, one row (CP3).
  const [splitDraft, setSplitDraft] = useState<{
    id: string
    lines: SplitDraftLine[]
  } | null>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  const queue = useQuery(queueOptions())
  // The same cache entry as the nav badge — one number, told once.
  const count = useQuery(countUnreviewedTransactionsOptions())
  const categories = useQuery({
    ...listCategoriesOptions({ query: { limit: 100 } }),
    enabled: state.panel === 'category' || state.panel === 'split',
  })
  const tags = useQuery({
    ...listTagsOptions({ query: { limit: 100 } }),
    enabled: state.rows.length > 0,
  })
  // Account labels name the pair callout's other leg (wireframe: "pairs
  // with Ally Savings …"). Loaded once; a ledger has few accounts.
  const accounts = useQuery(listAccountsOptions({}))
  // Onboarding's stateless trigger (#20): no accounts AND no connections —
  // the ledger's emptiness is the state, nothing is stored.
  const connections = useQuery(listConnectionsOptions())
  const emptyLedger =
    accounts.data !== undefined &&
    connections.data !== undefined &&
    accounts.data.items.length === 0 &&
    connections.data.items.length === 0
  // 'engaged' keeps the wizard mounted once the user starts it — a fresh
  // connection un-infers the trigger mid-flow, but step 3 must still show.
  // 'done' (plus the module-scope skip flag) lasts exactly one page load.
  const [wizard, setWizard] = useState<'inferred' | 'engaged' | 'done'>(
    'inferred',
  )
  const showOnboarding =
    wizard === 'engaged' ||
    (wizard === 'inferred' && emptyLedger && !onboardingSkippedThisLoad())

  // Server truth → reducer rows (order + date only; rendering re-joins).
  const items = queue.data?.items
  useEffect(() => {
    if (items !== undefined) {
      dispatch({
        type: 'sync',
        rows: items.map((txn) => ({ id: txn.id, date: txn.date })),
      })
    }
  }, [items])

  const byId = useMemo(
    () => new Map((items ?? []).map((txn) => [txn.id, txn])),
    [items],
  )
  // The reducer's rows drive the view, so accepted rows leave the moment
  // the mutation lands — progress is felt, not refreshed into existence.
  const visible = useMemo(
    () =>
      state.rows.flatMap((row) => {
        const txn = byId.get(row.id)
        return txn === undefined ? [] : [txn]
      }),
    [state.rows, byId],
  )
  const focusId = state.focusId
  const focused = focusId !== null ? (byId.get(focusId) ?? null) : null
  const correction: Correction =
    staged !== null && staged.id === focusId ? staged.value : {}
  const focusedSplitLines =
    splitDraft !== null && splitDraft.id === focusId ? splitDraft.lines : null

  // The detected pair's other leg. Usually it sits in the same unreviewed
  // list; when the counterpart was already reviewed (the Thursday case — a
  // proposal only mirrors on unreviewed sides) it is fetched on demand.
  const counterpartId = focused?.proposal?.counterpart_transaction_id ?? null
  const counterpartFetch = useQuery({
    ...getTransactionOptions({ path: { txn_id: counterpartId ?? '' } }),
    enabled: counterpartId !== null && !byId.has(counterpartId),
  })
  const focusedCounterpart =
    counterpartId !== null
      ? (byId.get(counterpartId) ?? counterpartFetch.data ?? null)
      : null

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
  /** The callout names the other leg by its account (wireframe voice),
   * falling back to its payee while accounts load. */
  function counterpartLabelFor(counterpart: TransactionOut): string {
    return accountLabels.get(counterpart.account_id) ?? payeeOf(counterpart)
  }

  function invalidateReviewData() {
    // Base keys match every variant (partial key matching), so the
    // Register's transaction lists re-ask too — a review changes them.
    queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
    queryClient.invalidateQueries({
      queryKey: countUnreviewedTransactionsQueryKey(),
    })
  }

  const review = useMutation({
    ...reviewTransactionMutation(),
    onSuccess: (_data, variables) => {
      // Consenting to a detected pair reviews BOTH sides in one act — the
      // mirror leaves the queue with it (backend consumes at depth 2).
      const counterpart = consumesCounterpart(
        byId.get(variables.path.txn_id),
        variables.body ?? null,
      )
      dispatch({
        type: 'remove',
        ids:
          counterpart !== null
            ? [variables.path.txn_id, counterpart]
            : [variables.path.txn_id],
      })
      invalidateReviewData()
    },
    // Reality re-asserts (a 409 means the row is already reviewed).
    onError: invalidateReviewData,
  })
  const reviewMany = useMutation({
    ...reviewBatchMutation(),
    onSuccess: (_data, variables) => {
      dispatch({ type: 'remove', ids: variables.body.ids })
      invalidateReviewData()
    },
    onError: invalidateReviewData,
  })
  const reviewing = review.isPending || reviewMany.isPending

  function acceptFocused() {
    if (focused === null || reviewing) return
    let splits: ReviewIn['splits'] | null = null
    if (focusedSplitLines !== null) {
      // The lines-vs-total guard: a mismatched document never reaches the
      // review call — A is inert until the lines balance (the cue says why).
      if (!splitStatus(focusedSplitLines, focused).valid) return
      splits = splitsForReview(focusedSplitLines, focused)
    }
    review.mutate({
      path: { txn_id: focused.id },
      body: reviewBody(correction, splits),
    })
  }

  /** T (or the Confirm button): consent to the detected pairing. Accepting
   * the det proposal as-is IS the consent shape — one empty-body review
   * consumes both sides. Staged corrections belong to the decline path and
   * never ride a consent. */
  function consentTransfer() {
    if (focused?.proposal?.proposed_transfer !== true || reviewing) return
    review.mutate({ path: { txn_id: focused.id }, body: null })
  }

  function acceptIds(ids: string[]) {
    if (ids.length === 0 || reviewing) return
    reviewMany.mutate({ body: { ids } })
  }

  function closePanel() {
    dispatch({ type: 'closePanel' })
    // Hand the keyboard back to the queue.
    listboxRef.current?.focus()
  }

  /** S: open the split editor, drafting the document on first open. The
   * split displaces a staged category — decision shapes are exclusive
   * (the API's 422) — while staged tags survive to ride along. */
  function openSplit() {
    if (focused === null) return
    if (splitDraft === null || splitDraft.id !== focused.id) {
      setSplitDraft({ id: focused.id, lines: initialSplitDraft(focused) })
      setStaged((prev) =>
        prev !== null && prev.id === focused.id
          ? { id: prev.id, value: { tags: prev.value.tags } }
          : prev,
      )
    }
    dispatch({ type: 'openPanel', panel: 'split' })
  }

  /** Merge back (wireframe): the draft collapses to the single unsplit
   * line — a wrong split is reversible in place, nothing was sent. */
  function mergeBack() {
    setSplitDraft((prev) =>
      prev !== null && prev.id === focusId ? null : prev,
    )
    closePanel()
  }

  // The keyboard verbs, window-level so the loop works without hunting for
  // focus first. Typing surfaces (the picker's filter, the tag input) are
  // exempt — keys there are text, not verbs.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable]')) {
        return
      }
      switch (event.key) {
        case 'j':
        case 'J':
          dispatch({ type: 'focusNext' })
          break
        case 'k':
        case 'K':
          dispatch({ type: 'focusPrev' })
          break
        case 'a':
          acceptFocused()
          break
        case 'A':
          acceptIds(state.rows.map((row) => row.id))
          break
        case 'c':
        case 'C':
          if (state.panel === 'category') closePanel()
          else dispatch({ type: 'openPanel', panel: 'category' })
          break
        case 's':
        case 'S':
          if (state.panel === 'split') closePanel()
          else openSplit()
          break
        case 't':
        case 'T':
          // Consent only exists where a pairing was detected — T is not a
          // dead verb elsewhere, it simply isn't one.
          if (focused?.proposal?.proposed_transfer !== true) return
          consentTransfer()
          break
        case 'Escape':
          if (state.panel !== null) closePanel()
          else return
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Keep the (virtual) focus in view; 'nearest' is instant, so reduced
  // motion needs no special case.
  useEffect(() => {
    if (focusId !== null) {
      document
        .getElementById(proposalRowDomId(focusId))
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusId])

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onEngage={() => setWizard('engaged')}
        onDone={() => setWizard('done')}
      />
    )
  }

  if (queue.isPending) {
    return (
      <div className="flex h-full flex-col gap-3" data-testid="inbox-loading">
        <div className="flex items-center justify-end">
          <Skeleton className="h-7 w-36" />
        </div>
        <div className="flex-1 space-y-3 overflow-hidden rounded-lg border p-4">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (queue.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="font-medium">Couldn’t load the Inbox</p>
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">
          {errorDetail(queue.error)}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => queue.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (visible.length === 0) return <InboxZero showConnect={emptyLedger} />

  const groups = dayGroups(visible)
  const reviewError = review.isError
    ? { error: review.error, retry: () => acceptFocused() }
    : reviewMany.isError
      ? {
          error: reviewMany.error,
          retry: () => acceptIds(state.rows.map((row) => row.id)),
        }
      : null

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-end gap-3.5">
        {reviewError !== null && (
          <p role="alert" className="text-destructive text-sm">
            {errorDetail(reviewError.error)}
          </p>
        )}
        <span
          data-testid="inbox-to-review"
          className="text-[11.5px] text-muted-foreground"
        >
          {count.data !== undefined
            ? `${count.data.count} to review`
            : `${visible.length} to review`}
        </span>
        <Button
          size="sm"
          disabled={reviewing}
          onClick={() => acceptIds(state.rows.map((row) => row.id))}
        >
          Accept all · ⇧A
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="flex min-w-0 flex-[1.35] flex-col border-r">
          <div
            ref={listboxRef}
            role="listbox"
            aria-label="Proposals awaiting review"
            aria-activedescendant={
              focusId !== null ? proposalRowDomId(focusId) : undefined
            }
            tabIndex={0}
            className="flex-1 overflow-y-auto py-1 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {groups.map((group, index) => (
              <section
                key={group.date}
                data-testid="inbox-day"
                aria-label={dayLabel(group.date)}
                className={index > 0 ? 'border-t' : undefined}
              >
                <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1.5">
                  <span className="label-caps">{dayLabel(group.date)}</span>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={reviewing}
                    onClick={() => acceptIds(group.rows.map((txn) => txn.id))}
                  >
                    Accept day
                  </Button>
                </div>
                {group.rows.map((txn) => {
                  // A det row says the pair out loud right under itself
                  // (wireframe #7's Venmo → Ally). The callout needs the
                  // other leg's row — mirrored pairs share this queue.
                  const rowCounterpartId =
                    txn.proposal?.proposed_transfer === true
                      ? (txn.proposal.counterpart_transaction_id ?? null)
                      : null
                  const rowCounterpart =
                    rowCounterpartId !== null
                      ? (byId.get(rowCounterpartId) ?? null)
                      : null
                  return (
                    <Fragment key={txn.id}>
                      <ProposalRow
                        txn={txn}
                        focused={txn.id === focusId}
                        onFocus={() => dispatch({ type: 'focus', id: txn.id })}
                      />
                      {rowCounterpart !== null && (
                        <PairCallout
                          counterpart={rowCounterpart}
                          counterpartLabel={counterpartLabelFor(rowCounterpart)}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </section>
            ))}
          </div>
          <KeyboardLegend />
        </div>
        {focused !== null && (
          <Inspector
            txn={focused}
            correction={correction}
            onCorrectionChange={(value) => {
              setStaged({ id: focused.id, value })
              // A staged category displaces a staged split — exclusive
              // decision shapes, the same law openSplit applies in reverse.
              if (value.category !== undefined) {
                setSplitDraft((prev) =>
                  prev !== null && prev.id === focused.id ? null : prev,
                )
              }
            }}
            panel={state.panel}
            onOpenCategory={() =>
              dispatch({ type: 'openPanel', panel: 'category' })
            }
            onCloseCategory={closePanel}
            onAccept={acceptFocused}
            accepting={reviewing}
            categories={categories.data?.items ?? []}
            categoriesPending={categories.isPending}
            tagSuggestions={tags.data?.items.map((tag) => tag.name) ?? []}
            splitLines={focusedSplitLines}
            onSplitLinesChange={(lines) =>
              setSplitDraft({ id: focused.id, lines })
            }
            onOpenSplit={openSplit}
            onMergeBack={mergeBack}
            counterpart={focusedCounterpart}
            counterpartLabel={
              focusedCounterpart !== null
                ? counterpartLabelFor(focusedCounterpart)
                : null
            }
            onConfirmTransfer={consentTransfer}
          />
        )}
      </div>
    </div>
  )
}

// The designed zero state (CP0, refined for CP2): inbox zero is the loop's
// earned resting point, not an error and not a blank. A skipped-through
// onboarding lands here too — with the route back to connecting (#20).
function InboxZero({ showConnect = false }: { showConnect?: boolean }) {
  return (
    <div
      data-testid="inbox-empty"
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <InboxIcon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 font-medium">Nothing to review</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        When transactions sync in, their category proposals queue here for a
        quick review pass — accept or correct, one at a time or all at once.
      </p>
      {showConnect && (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/connections">Connect a bank</Link>
        </Button>
      )}
    </div>
  )
}
