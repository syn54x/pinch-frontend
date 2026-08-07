import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { netWorthReportOptions } from '@/api/generated/@tanstack/react-query.gen'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinorUnits } from '@/lib/money'
import { deltaGlyph, deltaTone, formatDeltaPercent } from '@/lib/net-worth'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'

// The Dashboard's net-worth card, chartless since F10 CP2 (#88): the number
// lives on the Dashboard, the shape lives in Accounts. Hero balance, the
// this-month delta, and a link to the Accounts page's Net worth tab — no mini
// chart, no range picker. Any range returns the same as-of number and
// month-to-date delta; 1m is the cheapest ask.
export function NetWorthCard() {
  const report = useQuery({
    ...netWorthReportOptions({ query: { range: '1m' } }),
    throwOnError: true,
  })
  const data = report.data

  return (
    <section
      data-testid="dashboard-net-worth"
      className="flex flex-1 flex-col gap-2.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex items-center justify-between">
        <span className="label-caps">Net worth</span>
        <Link
          to="/accounts"
          data-testid="dashboard-nw-accounts-link"
          className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Accounts →
        </Link>
      </div>

      {data === undefined ? (
        <Skeleton className="h-8 w-40" />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span data-testid="dashboard-nw-hero" className="amount-big text-3xl">
            {formatMinorUnits(data.net_worth_minor, data.currency)}
          </span>
          <MonthToDate
            deltaMinor={data.month_to_date.delta_minor}
            percent={formatDeltaPercent(data.month_to_date)}
            currency={data.currency}
          />
        </div>
      )}
    </section>
  )
}

function MonthToDate({
  deltaMinor,
  percent,
  currency,
}: {
  deltaMinor: number
  percent: string | null
  currency: string
}) {
  const tone = deltaTone(deltaMinor)
  return (
    <span className={cn('amount text-[12.5px]', TONE_CLASS[tone])}>
      {deltaGlyph(deltaMinor)}{' '}
      {formatMinorUnits(Math.abs(deltaMinor), currency)}
      {percent !== null && ` · ${percent}`}{' '}
      <span className="text-muted-foreground">this month</span>
    </span>
  )
}
