import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import {
  getAccountOptions,
  listConnectionsOptions,
  listHoldingsOptions,
  listInvestmentActivitiesInfiniteOptions,
  listProvidersOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type {
  HoldingOut,
  InvestmentActivityOut,
} from '@/api/generated/types.gen'
import { amountClass, signedAmount } from '@/components/register/model'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMonthDay } from '@/lib/dates'
import { formatMinorUnits } from '@/lib/money'
import { PROVIDER_COPY, providerLacksHoldings } from '@/lib/providers'

export const Route = createFileRoute(
  '/_authed/accounts_/investments_/$accountId',
)({
  staticData: { title: 'Investments' },
  component: InvestmentsDetailPage,
})

/** A per-share quote is not an Amount (backend law): it keeps sub-cent
 * precision, so it gets its own formatter — up to 4 decimals, never
 * minor-units math. */
function formatQuote(price: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(price)
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
  }).format(quantity)
}

// M10 companion (pinch-frontend#66): raw truth for an investment account —
// a minimal holdings table and activity list straight off the new
// endpoints. Deliberately un-designed; the portfolio surface is a future
// wireframe-driven milestone.
function InvestmentsDetailPage() {
  const { accountId } = Route.useParams()

  const accountQuery = useQuery({
    ...getAccountOptions({ path: { account_id: accountId } }),
    throwOnError: true,
  })
  const holdingsQuery = useQuery({
    ...listHoldingsOptions({ query: { account_id: accountId } }),
    throwOnError: true,
  })
  // Connections back the empty state's honesty: an empty holdings list
  // reads differently when the account's connection is still waiting on
  // investments consent — or belongs to a provider that doesn't send
  // holdings at all (wireframe 7f). The catalog names that limit.
  const connectionsQuery = useQuery(listConnectionsOptions())
  const providersQuery = useQuery(listProvidersOptions())

  const account = accountQuery.data
  const holdings = holdingsQuery.data
  // The consent-waiting and capability-gap empties need the connections
  // and catalog answers before an empty holdings list can render —
  // otherwise the genuine-empty flashes first.
  const emptyNeedsConnections =
    holdings !== undefined &&
    holdings.items.length === 0 &&
    (connectionsQuery.isPending || providersQuery.isPending)
  if (
    account === undefined ||
    holdings === undefined ||
    emptyNeedsConnections
  ) {
    return <DetailSkeleton />
  }

  const connection = (connectionsQuery.data?.items ?? []).find((candidate) =>
    candidate.accounts.some((a) => a.id === accountId),
  )
  // The capability gap (7f): the account's connection belongs to a
  // provider whose catalog entry lacks the holdings atom — a stated
  // limit, driven by the catalog + the connection's provider, never
  // hardcoded per provider.
  const gapProviderLabel =
    connection !== undefined &&
    providerLacksHoldings(providersQuery.data ?? [], connection.provider)
      ? PROVIDER_COPY[connection.provider].label
      : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/accounts">
            <ChevronLeft aria-hidden /> Accounts
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="font-heading font-semibold text-xl">
          {account.label}
          {account.mask && (
            <span className="ml-2 font-normal text-muted-foreground text-sm">
              ···{account.mask}
            </span>
          )}
        </h1>
        {account.balance !== null && (
          <div className="mt-1">
            <p className="amount font-semibold text-lg">
              {formatMinorUnits(
                account.balance.amount_minor,
                account.balance.currency,
              )}
            </p>
            {connection !== undefined && (
              // Balance provenance (7f): who reported the number — quiet
              // metadata, present for every provider-backed account.
              <p
                data-testid="balance-provenance"
                className="text-muted-foreground text-xs"
              >
                balance reported by {PROVIDER_COPY[connection.provider].label}
              </p>
            )}
          </div>
        )}
      </div>

      <section data-testid="holdings-section">
        <h2 className="label-caps">Positions</h2>
        <div className="mt-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {holdings.items.length === 0 ? (
            <HoldingsEmpty
              manual={account.manual}
              consentRequired={
                connection?.investments_consent_required === true
              }
              gapProviderLabel={gapProviderLabel}
            />
          ) : (
            <>
              <div className="label-caps flex shrink-0 gap-3.5 border-b bg-muted/50 px-4 py-2">
                <span className="flex-1">Security</span>
                <span className="w-[90px] text-right">Qty</span>
                <span className="w-[100px] text-right">Price</span>
                <span className="w-[110px] text-right">Value</span>
                <span className="w-[110px] text-right">Cost basis</span>
              </div>
              {holdings.items.map((holding) => (
                <HoldingRow key={holding.id} holding={holding} />
              ))}
            </>
          )}
        </div>
      </section>

      <ActivitySection accountId={accountId} />
    </div>
  )
}

function HoldingRow({ holding }: { holding: HoldingOut }) {
  return (
    <div
      data-testid="holding-row"
      className="flex items-center gap-3.5 border-b px-4 py-2.5 text-sm last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {holding.security.name}
        </span>
        {holding.security.ticker_symbol && (
          <span className="text-muted-foreground text-xs">
            {holding.security.ticker_symbol}
          </span>
        )}
      </span>
      <span className="amount w-[90px] shrink-0 text-right">
        {formatQuantity(holding.quantity)}
      </span>
      <span className="amount w-[100px] shrink-0 text-right text-muted-foreground">
        {holding.institution_price !== null
          ? formatQuote(holding.institution_price, holding.currency)
          : '—'}
      </span>
      <span className="amount w-[110px] shrink-0 text-right">
        {holding.institution_value_minor !== null
          ? formatMinorUnits(holding.institution_value_minor, holding.currency)
          : '—'}
      </span>
      <span className="amount w-[110px] shrink-0 text-right text-muted-foreground">
        {holding.cost_basis_minor !== null
          ? formatMinorUnits(holding.cost_basis_minor, holding.currency)
          : '—'}
      </span>
    </div>
  )
}

function HoldingsEmpty({
  manual,
  consentRequired,
  gapProviderLabel,
}: {
  manual: boolean
  consentRequired: boolean
  /** Set when the account's provider doesn't deliver holdings (7f) —
   * the label names the provider in the stated-limit copy. */
  gapProviderLabel: string | null
}) {
  if (gapProviderLabel !== null) {
    // The capability gap (7f): explanation only — no phantom actions.
    // Relink and manual holdings are future features (backend PRD cuts),
    // so the empty state stays honest instead of offering buttons that
    // would split the ledger.
    return (
      <div
        data-testid="capability-gap-empty"
        className="px-4 py-8 text-center text-sm"
      >
        <p className="font-medium">
          {gapProviderLabel} doesn’t provide holdings for this connection
        </p>
        <p className="mt-1 text-muted-foreground">
          Balances and transactions keep syncing, and the balance counts in Net
          Worth. Nothing here is missing from your account — the provider just
          doesn’t send it.
        </p>
      </div>
    )
  }
  if (consentRequired) {
    // Consent granted nothing yet — the pull can't run until the
    // connection's Enable-investments walk happens. Honest, with the path.
    return (
      <div
        data-testid="investments-consent-empty"
        className="px-4 py-8 text-center text-sm"
      >
        <p className="font-medium">Waiting on investments access</p>
        <p className="mt-1 text-muted-foreground">
          This account's connection hasn't granted investments data yet.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/connections">Enable investments</Link>
        </Button>
      </div>
    )
  }
  return (
    <div
      data-testid="investments-empty"
      className="px-4 py-8 text-center text-sm"
    >
      <p className="font-medium">No holdings yet</p>
      <p className="mt-1 text-muted-foreground">
        {manual
          ? "Manual accounts don't sync holdings."
          : // No promise of delivery — the contract carries no
            // first-pull-ran signal, so this stays descriptive.
            "The connection hasn't reported positions for this account."}
      </p>
    </div>
  )
}

function ActivitySection({ accountId }: { accountId: string }) {
  const activities = useInfiniteQuery({
    ...listInvestmentActivitiesInfiniteOptions({
      query: { account_id: accountId, limit: 50 },
    }),
    // First page param must be an object, not a bare cursor string (the
    // register's hard-won note).
    initialPageParam: {},
    getNextPageParam: (page) =>
      page.next_cursor === null
        ? undefined
        : { query: { cursor: page.next_cursor } },
    throwOnError: true,
  })

  const items = activities.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section data-testid="activity-section">
      <h2 className="label-caps">Activity</h2>
      <div className="mt-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {activities.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="activity-empty"
            className="px-4 py-8 text-center text-sm"
          >
            <p className="font-medium">No activity yet</p>
            <p className="mt-1 text-muted-foreground">
              Buys, sells, dividends, and fees appear here once synced.
            </p>
          </div>
        ) : (
          <>
            {items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
            {activities.hasNextPage && (
              <div className="border-t p-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={activities.isFetchingNextPage}
                  onClick={() => activities.fetchNextPage()}
                >
                  {activities.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ActivityRow({ activity }: { activity: InvestmentActivityOut }) {
  const detail = [
    activity.subtype ?? activity.type,
    activity.security?.ticker_symbol,
    activity.quantity !== 0 ? formatQuantity(activity.quantity) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      data-testid="activity-row"
      className="flex items-center gap-3.5 border-b px-4 py-2.5 text-sm last:border-b-0"
    >
      <span className="w-[52px] shrink-0 text-muted-foreground text-xs">
        {formatMonthDay(activity.date)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{activity.name}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </span>
      <span
        className={`amount w-[110px] shrink-0 text-right ${amountClass(activity.amount_minor)}`}
      >
        {signedAmount(activity.amount_minor, activity.currency)}
      </span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}
