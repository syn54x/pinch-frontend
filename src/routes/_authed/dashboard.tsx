import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ledgerStatsOptions,
  listAccountsOptions,
  listConnectionsOptions,
  meOptions,
  recurringReportOptions,
  spendingReportOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import { DashboardEmpty } from '@/components/dashboard/dashboard-empty'
import { NetWorthCard } from '@/components/dashboard/net-worth-card'
import { PennyReadTeaser } from '@/components/dashboard/penny-read-teaser'
import { ToReviewCard } from '@/components/dashboard/to-review-card'
import { ProvenanceBadge } from '@/components/inbox/provenance-badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkline } from '@/components/ui/sparkline'
import { StatTile } from '@/components/ui/stat-tile'
import {
  billsSummary,
  greeting,
  provenanceSplit,
  sparkValues,
} from '@/lib/dashboard'
import { formatMinorUnits } from '@/lib/money'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'

// F5 CP5 (#32, wireframe s6/s6b/s6e): the Dashboard, the new home. Everything a
// user needs before they click — net worth and its direction, what's due, what
// needs review — from the merged M8 client. `/` now lands here (index redirect
// flipped). Empty ledgers get s6e (one job: connect), never a wall of zeros.
// Liveness is invalidation + refocus, never polling.
export const Route = createFileRoute('/_authed/dashboard')({
  staticData: { title: 'Dashboard' },
  component: DashboardPage,
})

const dateLine = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

function monthName(month: string): string {
  // SpendingOut.month is "YYYY-MM"; render its long month name.
  const [year, mon] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    new Date(year, mon - 1, 1),
  )
}

function DashboardPage() {
  const me = useQuery({ ...meOptions(), throwOnError: true })
  const stats = useQuery({ ...ledgerStatsOptions(), throwOnError: true })
  const spending = useQuery({ ...spendingReportOptions(), throwOnError: true })
  const recurring = useQuery({
    ...recurringReportOptions(),
    throwOnError: true,
  })
  const accounts = useQuery({ ...listAccountsOptions({}), throwOnError: true })
  const connections = useQuery({
    ...listConnectionsOptions(),
    throwOnError: true,
  })

  const ready =
    me.data !== undefined &&
    stats.data !== undefined &&
    spending.data !== undefined &&
    recurring.data !== undefined &&
    accounts.data !== undefined &&
    connections.data !== undefined
  if (!ready) return <DashboardSkeleton />

  const name = me.data.display_name.trim()
  const emptyLedger =
    accounts.data.items.length === 0 && connections.data.items.length === 0
  if (emptyLedger) return <DashboardEmpty name={name} />

  const now = new Date()
  const syncedAt = stats.data.last_synced_at
  const split = provenanceSplit(stats.data.unreviewed_by_provenance)
  const bills = billsSummary(recurring.data.due_next_7_days)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-2xl">
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {dateLine.format(now)}
            {syncedAt !== null &&
              ` · everything synced ${relativeTime(syncedAt)}`}
          </p>
        </div>
        {stats.data.unreviewed > 0 && (
          <Link
            to="/inbox"
            data-testid="dashboard-review-cta"
            className={cn(buttonVariants())}
          >
            Review {stats.data.unreviewed} transactions →
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <NetWorthCard />
        <PennyReadTeaser />
      </div>

      <div data-testid="dashboard-tiles" className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="To review"
          value={stats.data.unreviewed}
          data-testid="tile-to-review"
        >
          {split.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {split.map(({ key, count }) => (
                <span key={key} className="flex items-center gap-1">
                  <ProvenanceBadge provenance={key} />
                  <span className="text-[11px] text-muted-foreground">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </StatTile>

        <StatTile
          label={`Spending · ${monthName(spending.data.month)}`}
          value={formatMinorUnits(
            spending.data.total_minor,
            spending.data.currency,
          )}
          data-testid="tile-spending"
        >
          <Sparkline
            values={sparkValues(spending.data.by_day)}
            label={`Daily spending in ${monthName(spending.data.month)}`}
          />
        </StatTile>

        <StatTile
          label="Next 7 days · bills"
          value={formatMinorUnits(
            recurring.data.due_next_7_days_minor,
            spending.data.currency,
          )}
          delta={bills || undefined}
          data-testid="tile-bills"
        />
      </div>

      <ToReviewCard />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <Skeleton className="h-48 flex-1" />
        <Skeleton className="h-48 flex-1" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
