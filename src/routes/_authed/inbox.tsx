import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Inbox as InboxIcon } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  countUnreviewedTransactionsOptions,
  countUnreviewedTransactionsQueryKey,
  listCategoriesOptions,
  listTagsOptions,
  listTransactionsOptions,
  listTransactionsQueryKey,
  reviewBatchMutation,
  reviewTransactionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { ReviewIn } from '@/api/generated/types.gen'
import { dayLabel } from '@/components/inbox/day-label'
import { type Correction, Inspector } from '@/components/inbox/inspector'
import { KeyboardLegend } from '@/components/inbox/keyboard-legend'
import { ProposalRow, proposalRowDomId } from '@/components/inbox/proposal-row'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dayGroups, inboxReducer, initialInboxState } from '@/lib/inbox-reducer'

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
 * the same single call (field-present merge, reviews API). */
function reviewBody(correction: Correction): ReviewIn | null {
  if (correction.category === undefined && correction.tags === undefined) {
    return null
  }
  const body: ReviewIn = {}
  if (correction.category !== undefined) {
    body.category_id = correction.category.id
  }
  if (correction.tags !== undefined) body.tags = correction.tags
  return body
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
  const listboxRef = useRef<HTMLDivElement>(null)

  const queue = useQuery(queueOptions())
  // The same cache entry as the nav badge — one number, told once.
  const count = useQuery(countUnreviewedTransactionsOptions())
  const categories = useQuery({
    ...listCategoriesOptions({ query: { limit: 100 } }),
    enabled: state.panel === 'category',
  })
  const tags = useQuery({
    ...listTagsOptions({ query: { limit: 100 } }),
    enabled: state.rows.length > 0,
  })

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
      dispatch({ type: 'remove', ids: [variables.path.txn_id] })
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
    if (state.focusId === null || reviewing) return
    review.mutate({
      path: { txn_id: state.focusId },
      body: reviewBody(correction),
    })
  }

  function acceptIds(ids: string[]) {
    if (ids.length === 0 || reviewing) return
    reviewMany.mutate({ body: { ids } })
  }

  function closeCategory() {
    dispatch({ type: 'closePanel' })
    // Hand the keyboard back to the queue.
    listboxRef.current?.focus()
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
          if (state.panel === 'category') closeCategory()
          else dispatch({ type: 'openPanel', panel: 'category' })
          break
        case 'Escape':
          if (state.panel !== null) closeCategory()
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

  if (visible.length === 0) return <InboxZero />

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
                {group.rows.map((txn) => (
                  <ProposalRow
                    key={txn.id}
                    txn={txn}
                    focused={txn.id === focusId}
                    onFocus={() => dispatch({ type: 'focus', id: txn.id })}
                  />
                ))}
              </section>
            ))}
          </div>
          <KeyboardLegend />
        </div>
        {focused !== null && (
          <Inspector
            txn={focused}
            correction={correction}
            onCorrectionChange={(value) => setStaged({ id: focused.id, value })}
            panel={state.panel}
            onOpenCategory={() =>
              dispatch({ type: 'openPanel', panel: 'category' })
            }
            onCloseCategory={closeCategory}
            onAccept={acceptFocused}
            accepting={reviewing}
            categories={categories.data?.items ?? []}
            categoriesPending={categories.isPending}
            tagSuggestions={tags.data?.items.map((tag) => tag.name) ?? []}
          />
        )}
      </div>
    </div>
  )
}

// The designed zero state (CP0, refined for CP2): inbox zero is the loop's
// earned resting point, not an error and not a blank.
function InboxZero() {
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
    </div>
  )
}
