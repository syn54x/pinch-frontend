import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import {
  listAccountsOptions,
  listConnectionsOptions,
  listTransactionsInfiniteOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  OnboardingWizard,
  onboardingSkippedThisLoad,
} from '@/components/onboarding/wizard'
import { FilterBar } from '@/components/register/filter-bar'
import { Inspector } from '@/components/register/inspector'
import {
  groupByDay,
  hasActiveFilters,
  type RegisterSearch,
  sanitizeRegisterSearch,
  toListQuery,
} from '@/components/register/model'
import { TransactionList } from '@/components/register/transaction-list'
import { ViewTabs } from '@/components/register/view-tabs'
import { ReviewQueue } from '@/components/review/review-queue'

// Cursor pages of 50: dense enough that one screen never paginates, small
// enough that a large history streams in smoothly.
const PAGE_SIZE = 50

export const Route = createFileRoute('/_authed/register')({
  staticData: { title: 'Register' },
  // The find-grammar lives in the URL — view, filters, search, and the
  // selected transaction survive reload and share as links.
  validateSearch: (raw: Record<string, unknown>): RegisterSearch =>
    sanitizeRegisterSearch(raw),
  component: RegisterPage,
})

// The Register (F3 CP1, reshaped by F10 CP1 / ADR 0002): ONE surface for
// money movement, in three URL-backed views. All — the date-grouped,
// cursor-paginated list with composing filters (wireframe s8). To review —
// the pure queue, absorbed whole from the retired Inbox route (wireframe
// s7); the filter bar hides there and any filter params in the URL sit
// inert until the user switches back. Uncategorized — reviewed rows still
// missing a category, through the shared filter bar. First-run onboarding
// mounts here too (the queue is the wizard's landing surface).
function RegisterPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const patchSearch = useCallback(
    (patch: Partial<RegisterSearch>) => {
      navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      })
    },
    [navigate],
  )

  // Onboarding's stateless trigger (#20, rehomed from the Inbox by F10
  // CP1): no accounts AND no connections — the ledger's emptiness is the
  // state, nothing is stored.
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
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

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onEngage={() => setWizard('engaged')}
        onDone={() => {
          // The wizard's hand-off lands on the To-review tab — the heir of
          // "a full Inbox" — whichever view the empty ledger was opened on.
          setWizard('done')
          patchSearch({ view: 'review' })
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border">
      <ViewTabs view={search.view} />
      {search.view === 'review' ? (
        <ReviewQueue />
      ) : (
        <BrowseView search={search} patchSearch={patchSearch} />
      )}
    </div>
  )
}

// The browsing views (All and Uncategorized): filter bar over the list and
// the Inspector. Split out so its queries mount only when a browsing view
// is showing — the To-review tab runs the queue's queries instead.
function BrowseView({
  search,
  patchSearch,
}: {
  search: RegisterSearch
  patchSearch: (patch: Partial<RegisterSearch>) => void
}) {
  const list = useInfiniteQuery({
    ...listTransactionsInfiniteOptions({
      query: { ...toListQuery(search), limit: PAGE_SIZE },
    }),
    // First page param must be an object (the generated queryFn treats a
    // bare string as a cursor); later pages pass next_cursor strings.
    initialPageParam: {},
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // Filter changes keep the previous rows on screen (dimmed) instead of
    // flashing skeletons.
    placeholderData: keepPreviousData,
    throwOnError: (_, query) => query.state.data === undefined,
  })

  // The Manual badge's source of truth (F10 CP5): rows on manual accounts
  // wear it, synced rows never do. Same options as the filter bar — one
  // cached accounts query serves both.
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const accountItems = accounts.data?.items
  const manualAccountIds = useMemo(
    () =>
      new Set(
        (accountItems ?? [])
          .filter((account) => account.manual)
          .map((account) => account.id),
      ),
    [accountItems],
  )

  const pages = list.data?.pages
  const items = useMemo(
    () => pages?.flatMap((page) => page.items) ?? [],
    [pages],
  )
  // The reviewing variant's queue: the loaded unreviewed rows, for pair
  // resolution and manual-transfer candidates.
  const queueById = useMemo(
    () =>
      new Map(
        items
          .filter((txn) => txn.reviewed_at === null)
          .map((txn) => [txn.id, txn]),
      ),
    [items],
  )
  const fetchNextPage = list.fetchNextPage
  const onFetchNextPage = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])
  const clearFilters = useCallback(
    () =>
      patchSearch({
        q: undefined,
        account: undefined,
        category: undefined,
        tag: undefined,
        from: undefined,
        to: undefined,
      }),
    [patchSearch],
  )

  return (
    <>
      <FilterBar search={search} onPatch={patchSearch} />
      <div className="flex min-h-0 flex-1">
        <TransactionList
          groups={groupByDay(items)}
          selectedId={search.txn}
          onSelect={(txn) => patchSearch({ txn })}
          manualAccountIds={manualAccountIds}
          isFiltered={hasActiveFilters(search)}
          emptyState={
            search.view === 'uncategorized' ? <UncategorizedZero /> : undefined
          }
          isLoading={list.isPending}
          isRefreshing={list.isPlaceholderData}
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          nextPageFailed={list.isFetchNextPageError}
          onFetchNextPage={onFetchNextPage}
          onClearFilters={clearFilters}
        />
        <Inspector
          txnId={search.txn}
          seed={items.find((txn) => txn.id === search.txn)}
          queueById={queueById}
        />
      </div>
    </>
  )
}

// The Uncategorized view's honest zero: emptiness here means every reviewed
// transaction has a category — a resting state, not an empty ledger.
function UncategorizedZero() {
  return (
    <div
      data-testid="uncategorized-empty"
      className="flex h-full flex-col items-center justify-center p-6 text-center"
    >
      <p className="font-medium">Nothing uncategorized</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        Every reviewed transaction has a category. Rows land here when a review
        files them without one.
      </p>
    </div>
  )
}
