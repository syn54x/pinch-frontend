import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode, useEffect, useRef } from 'react'
import type { TransactionOut } from '@/api/generated/types.gen'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CatPill } from './catpill'
import {
  amountClass,
  type DayGroup,
  formatDayHeading,
  payeeOf,
  signedAmount,
} from './model'

// The ledger column (wireframe #8, left pane): mono-caps column header, then
// day-grouped rows — payee (with transfer/split/unreviewed marks), catpill,
// right-aligned signed amount. Scrolling the sentinel into view pulls the
// next cursor page.

export function TransactionList({
  groups,
  selectedId,
  onSelect,
  isFiltered,
  isLoading,
  isRefreshing,
  hasNextPage,
  isFetchingNextPage,
  nextPageFailed,
  onFetchNextPage,
  onClearFilters,
}: {
  groups: DayGroup[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  /** Distinguishes "ledger is empty" from "nothing matches these filters". */
  isFiltered: boolean
  isLoading: boolean
  /** A filter change is in flight over previous results. */
  isRefreshing: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageFailed: boolean
  onFetchNextPage: () => void
  onClearFilters: () => void
}) {
  const empty = !isLoading && groups.length === 0

  return (
    <div className="flex min-w-0 flex-[1.4] flex-col overflow-hidden border-r">
      <div className="flex shrink-0 gap-3.5 border-b bg-muted/50 px-4 py-2">
        <span className="label-caps flex-1">Payee</span>
        <span className="label-caps w-[120px]">Category</span>
        <span className="label-caps w-[90px] text-right">Amount</span>
      </div>
      <div
        data-testid="register-list"
        className={cn(
          'flex-1 overflow-y-auto transition-opacity',
          isRefreshing && 'opacity-60',
        )}
      >
        {isLoading ? (
          <RowSkeletons />
        ) : empty && isFiltered ? (
          <NoMatches onClearFilters={onClearFilters} />
        ) : empty ? (
          <EmptyLedger />
        ) : (
          <>
            {groups.map((group, index) => (
              <Fragment key={group.date}>
                <div
                  className={cn(
                    'px-4 pt-2 pb-1 font-semibold text-[11.5px] text-muted-foreground',
                    index > 0 && 'border-t',
                  )}
                >
                  {formatDayHeading(group.date)}
                </div>
                {group.items.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    selected={txn.id === selectedId}
                    onSelect={() => onSelect(txn.id)}
                  />
                ))}
              </Fragment>
            ))}
            <PageTail
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              nextPageFailed={nextPageFailed}
              onFetchNextPage={onFetchNextPage}
            />
          </>
        )}
      </div>
    </div>
  )
}

function TransactionRow({
  txn,
  selected,
  onSelect,
}: {
  txn: TransactionOut
  selected: boolean
  onSelect: () => void
}) {
  const isTransfer = txn.transfer !== null
  const splitCount = txn.splits?.length ?? 0
  const unreviewed = txn.reviewed_at === null

  // Overlay-button row: the whole row selects (one focus stop, honest
  // semantics), while the unreviewed mark stays an independent link to the
  // Inbox — review verbs live there, never here.
  return (
    <div
      data-testid="txn-row"
      className={cn(
        'relative flex items-center gap-3.5 px-4 py-2',
        selected ? 'bg-accent' : 'hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        aria-label={`Inspect ${payeeOf(txn)}`}
        aria-current={selected || undefined}
        onClick={onSelect}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
      />
      <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate font-medium text-[12.5px]">
          {payeeOf(txn)}
        </span>
        {isTransfer && (
          <RowMark title="Transfer — excluded from spending">transfer</RowMark>
        )}
        {splitCount > 0 && (
          <RowMark>
            {splitCount} {splitCount === 1 ? 'split' : 'splits'}
          </RowMark>
        )}
        {unreviewed && (
          <Link
            to="/inbox"
            data-testid="row-unreviewed-link"
            title="Awaiting review — open the Inbox"
            className="pointer-events-auto relative inline-flex shrink-0 items-center rounded-full border px-1.5 py-px font-mono text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-2"
          >
            unreviewed
          </Link>
        )}
      </div>
      <div className="pointer-events-none relative w-[120px] shrink-0">
        {isTransfer ? (
          <span className="text-[11.5px] text-muted-foreground">—</span>
        ) : splitCount > 0 ? (
          <span className="text-[11.5px] text-muted-foreground">split</span>
        ) : txn.category ? (
          <CatPill category={txn.category} className="max-w-[120px]" />
        ) : (
          <span className="text-[11.5px] text-muted-foreground">—</span>
        )}
      </div>
      <span
        className={cn(
          'amount pointer-events-none relative w-[90px] shrink-0 text-right text-[12.5px]',
          amountClass(txn.amount_minor),
        )}
      >
        {signedAmount(txn.amount_minor, txn.currency)}
      </span>
    </div>
  )
}

function RowMark({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-px font-mono text-[10px] text-muted-foreground"
    >
      {children}
    </span>
  )
}

// The infinite tail: an intersection sentinel that quietly pulls the next
// page, a calm status while it loads, and a plain retry if a page fails.
function PageTail({
  hasNextPage,
  isFetchingNextPage,
  nextPageFailed,
  onFetchNextPage,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageFailed: boolean
  onFetchNextPage: () => void
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const armed = hasNextPage && !isFetchingNextPage && !nextPageFailed

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!armed || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onFetchNextPage()
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [armed, onFetchNextPage])

  if (!hasNextPage) return null
  return (
    <div
      ref={sentinelRef}
      data-testid="register-sentinel"
      className="flex items-center justify-center py-3 text-[11.5px] text-muted-foreground"
    >
      {nextPageFailed ? (
        <span role="alert" className="flex items-center gap-2">
          Couldn’t load more.
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={onFetchNextPage}
          >
            Retry
          </button>
        </span>
      ) : (
        <span>{isFetchingNextPage ? 'Loading more…' : 'More…'}</span>
      )}
    </div>
  )
}

function RowSkeletons() {
  return (
    <div className="space-y-2 p-4" aria-hidden data-testid="register-loading">
      <Skeleton className="h-3 w-16" />
      {[1, 2, 3, 4, 5, 6].map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  )
}

// The ledger is genuinely empty — CP0's honest empty state, kept.
function EmptyLedger() {
  return (
    <div
      data-testid="register-empty"
      className="flex h-full flex-col items-center justify-center p-6 text-center"
    >
      <p className="font-medium">No transactions yet</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        Once an account starts syncing, every movement lands here — searchable,
        filterable, and editable in place.
      </p>
    </div>
  )
}

// Filters are on and nothing survived them — a different fact than an empty
// ledger, with the obvious way out.
function NoMatches({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div
      data-testid="register-no-matches"
      className="flex h-full flex-col items-center justify-center p-6 text-center"
    >
      <p className="font-medium">No matches</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        Nothing in the ledger fits these filters.
      </p>
      <button
        type="button"
        className="mt-3 text-muted-foreground text-sm underline underline-offset-2 hover:text-foreground"
        onClick={onClearFilters}
      >
        Clear filters
      </button>
    </div>
  )
}
