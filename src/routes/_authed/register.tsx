import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { listTransactionsInfiniteOptions } from '@/api/generated/@tanstack/react-query.gen'
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

// Cursor pages of 50: dense enough that one screen never paginates, small
// enough that a large history streams in smoothly.
const PAGE_SIZE = 50

export const Route = createFileRoute('/_authed/register')({
  staticData: { title: 'Register' },
  // The find-grammar lives in the URL — filters, search, and the selected
  // transaction survive reload and share as links.
  validateSearch: (raw: Record<string, unknown>): RegisterSearch =>
    sanitizeRegisterSearch(raw),
  component: RegisterPage,
})

// F3 CP1 — the Register (wireframe #8): a date-grouped, cursor-paginated
// transaction list with composing filters and text search, beside the
// Inspector where every field edits in place. A read surface: review verbs
// live in the Inbox; unreviewed rows route there.
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

  const items = list.data?.pages.flatMap((page) => page.items) ?? []
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border">
      <FilterBar search={search} onPatch={patchSearch} />
      <div className="flex min-h-0 flex-1">
        <TransactionList
          groups={groupByDay(items)}
          selectedId={search.txn}
          onSelect={(txn) => patchSearch({ txn })}
          isFiltered={hasActiveFilters(search)}
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
        />
      </div>
    </div>
  )
}
