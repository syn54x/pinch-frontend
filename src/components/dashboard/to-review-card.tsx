import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ledgerStatsQueryKey,
  listAccountsOptions,
  listTransactionsOptions,
  reviewBatchMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { TransactionOut } from '@/api/generated/types.gen'
import {
  CategoryPill,
  UncategorizedPill,
} from '@/components/inbox/category-pill'
import { dayLabel } from '@/components/inbox/day-label'
import { ProvenanceBadge } from '@/components/inbox/provenance-badge'
import { payeeOf } from '@/components/inbox/reviewer-model'
import {
  invalidateReviewData,
  useReviewController,
} from '@/components/inbox/use-review-controller'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dayIndexOf, queuePosition } from '@/lib/dashboard'
import { dayGroups, inboxReducer, initialInboxState } from '@/lib/inbox-reducer'
import { formatMinorUnits } from '@/lib/money'
import { FixDrawer } from './fix-drawer'

// The Dashboard's To-review card (wireframe s6): a day-pager over the unreviewed
// queue. Accept the easy ones inline (✓), Accept a whole day (A), or Fix the odd
// one in the drawer that walks the full queue. This component is the reviewer
// HOST — it owns the queue reducer, focus, the batch verbs, and the review
// controller — mirroring the Inbox page so the same ReviewerPanel mounts in the
// drawer. Accepting invalidates the review list, the unreviewed count, AND the
// ledger stats (the To-review tile above reads them). Liveness is invalidation
// + refocus, never polling.
const QUEUE_PAGE = 100

export function ToReviewCard() {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(inboxReducer, initialInboxState)
  const [dayIndex, setDayIndex] = useState(0)
  const [fixOpen, setFixOpen] = useState(false)
  const [originId, setOriginId] = useState<string | null>(null)
  const drawerBodyRef = useRef<HTMLDivElement>(null)

  const queue = useQuery(
    listTransactionsOptions({ query: { reviewed: false, limit: QUEUE_PAGE } }),
  )
  const accounts = useQuery(listAccountsOptions({}))

  const items = queue.data?.items
  useEffect(() => {
    if (items !== undefined) {
      dispatch({
        type: 'sync',
        rows: items.map((txn) => ({ id: txn.id, date: txn.date })),
      })
    }
  }, [items])

  const byId = new Map((items ?? []).map((txn) => [txn.id, txn]))
  const visible = state.rows.flatMap((row) => {
    const txn = byId.get(row.id)
    return txn === undefined ? [] : [txn]
  })
  const groups = dayGroups(visible)
  const focusId = state.focusId
  const focused = focusId !== null ? (byId.get(focusId) ?? null) : null

  const accountLabels = new Map(
    (accounts.data?.items ?? []).map((account) => [account.id, account.label]),
  )

  const reviewMany = useMutation({
    ...reviewBatchMutation(),
    onSuccess: (_data, variables) => {
      dispatch({ type: 'remove', ids: variables.body.ids })
      invalidate()
    },
    onError: invalidate,
  })

  function invalidate() {
    invalidateReviewData(queryClient)
    queryClient.invalidateQueries({ queryKey: ledgerStatsQueryKey() })
  }

  const reviewer = useReviewController({
    txn: fixOpen ? focused : null,
    queueById: byId,
    accountLabel: (id) => accountLabels.get(id),
    externalBusy: reviewMany.isPending,
    onReviewed: (ids) => dispatch({ type: 'remove', ids }),
    onReturnFocus: () => drawerBodyRef.current?.focus(),
  })
  const busy = reviewer.busy

  function acceptIds(ids: string[]) {
    if (ids.length === 0 || busy) return
    reviewMany.mutate({ body: { ids } })
  }

  function openFix(id: string) {
    dispatch({ type: 'focus', id })
    setOriginId(id)
    setFixOpen(true)
  }

  // "Accept day · A" — the shown day's rows, from the keyboard, when the drawer
  // isn't holding focus and the user isn't typing.
  const shownIndex = fixOpen
    ? Math.max(0, dayIndexOf(groups, focusId))
    : Math.min(dayIndex, Math.max(0, groups.length - 1))
  const shownDay = groups[shownIndex]
  useEffect(() => {
    if (fixOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'a' && event.key !== 'A') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (shownDay === undefined) return
      event.preventDefault()
      acceptIds(shownDay.rows.map((txn) => txn.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (queue.data === undefined) {
    return (
      <section className="rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium text-sm">To review</span>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </section>
    )
  }

  if (visible.length === 0) {
    return (
      <section
        data-testid="dashboard-to-review"
        className="flex items-center justify-between rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10"
      >
        <span className="font-medium text-sm">To review</span>
        <span className="text-[13px] text-muted-foreground">
          Nothing to review — you're all caught up.
        </span>
      </section>
    )
  }

  const atFirstDay = shownIndex <= 0
  const atLastDay = shownIndex >= groups.length - 1
  const position = queuePosition(
    visible.map((txn) => txn.id),
    focusId,
  )

  return (
    <>
      <section
        data-testid="dashboard-to-review"
        className="rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium text-sm">To review</span>
          <span className="flex items-center gap-3">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Grouped by day
            </span>
            <Link
              to="/inbox"
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Open Inbox →
            </Link>
          </span>
        </div>

        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <span className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Previous day"
              disabled={atFirstDay}
              onClick={() => setDayIndex(shownIndex - 1)}
              className="flex size-6 items-center justify-center rounded-md border text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              ‹
            </button>
            <span
              data-testid="to-review-day"
              className="label-caps min-w-[128px] text-center"
            >
              {dayLabel(shownDay.date)} · {shownDay.rows.length}
            </span>
            <button
              type="button"
              aria-label="Next day"
              disabled={atLastDay}
              onClick={() => setDayIndex(shownIndex + 1)}
              className="flex size-6 items-center justify-center rounded-md border text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              ›
            </button>
          </span>
          <span className="flex items-center gap-3">
            <span
              data-testid="to-review-left"
              className="text-[11.5px] text-muted-foreground"
            >
              {visible.length} left
            </span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => acceptIds(shownDay.rows.map((txn) => txn.id))}
            >
              Accept day · A
            </Button>
          </span>
        </div>

        <div className="pb-2">
          {shownDay.rows.map((txn) => (
            <ReviewRow
              key={txn.id}
              txn={txn}
              busy={busy}
              onAccept={() => acceptIds([txn.id])}
              onFix={() => openFix(txn.id)}
            />
          ))}
        </div>
      </section>

      <FixDrawer
        open={fixOpen}
        onClose={() => setFixOpen(false)}
        focused={focused}
        position={position.position}
        total={position.total}
        reviewer={reviewer}
        accepting={busy}
        bodyRef={drawerBodyRef}
        originId={originId}
      />
    </>
  )
}

function ReviewRow({
  txn,
  busy,
  onAccept,
  onFix,
}: {
  txn: TransactionOut
  busy: boolean
  onAccept: () => void
  onFix: () => void
}) {
  const category = txn.proposal?.category ?? txn.category
  const provenance = txn.proposal?.provenance
  const negative = txn.amount_minor < 0
  return (
    <div
      data-testid="to-review-row"
      className="flex items-center gap-3 px-4 py-2"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[12.5px]">{payeeOf(txn)}</div>
        <div className="mt-0.5">
          {category !== null ? (
            <CategoryPill category={category} />
          ) : (
            <UncategorizedPill />
          )}
        </div>
      </div>
      {provenance !== undefined && provenance !== 'none' && (
        <ProvenanceBadge provenance={provenance} />
      )}
      <span
        className={
          negative
            ? 'amount shrink-0 text-[12.5px] text-destructive'
            : 'amount shrink-0 text-[12.5px] text-success'
        }
      >
        {formatMinorUnits(txn.amount_minor, txn.currency)}
      </span>
      <Button
        size="sm"
        disabled={busy}
        aria-label={`Accept ${payeeOf(txn)}`}
        onClick={onAccept}
      >
        <Check aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onFix}
        data-testid={`fix-${txn.id}`}
      >
        Fix
      </Button>
    </div>
  )
}
