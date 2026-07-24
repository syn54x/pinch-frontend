import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { netWorthReportOptions } from '@/api/generated/@tanstack/react-query.gen'
import { ChartA11y } from '@/components/chart-a11y'
import { Area } from '@/components/charts/area'
import { AreaChart } from '@/components/charts/area-chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinorUnits } from '@/lib/money'
import { deltaGlyph, deltaTone, formatDeltaPercent } from '@/lib/net-worth'
import { cn } from '@/lib/utils'

// The Dashboard's net-worth mini-card (wireframe s6): a hero balance, a
// this-month badge, and an axis-less sweep of history. The full chart — the
// dashed projection, the "now" divider, the by-account rows — lives on
// /net-worth; here it's a glanceable trend. The "6M ▾" range is LOCAL state
// that resets on navigation (PRD Decision 8), deliberately NOT URL-backed like
// the Net Worth page's control.

type Range = '1m' | '6m' | '1y' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
]

const TONE_CLASS = {
  positive: 'text-success',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
} as const

const monthYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

export function NetWorthCard() {
  const [range, setRange] = useState<Range>('6m')
  const report = useQuery({
    ...netWorthReportOptions({ query: { range } }),
    placeholderData: keepPreviousData,
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
        <label className="sr-only" htmlFor="dashboard-nw-range">
          Net worth range
        </label>
        <select
          id="dashboard-nw-range"
          aria-label="Net worth range"
          value={range}
          onChange={(event) => setRange(event.target.value as Range)}
          className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {RANGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {data === undefined ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              data-testid="dashboard-nw-hero"
              className="amount font-semibold text-3xl"
            >
              {formatMinorUnits(data.net_worth_minor, data.currency)}
            </span>
            <MonthToDate
              deltaMinor={data.month_to_date.delta_minor}
              percent={formatDeltaPercent(data.month_to_date)}
              currency={data.currency}
            />
          </div>
          {data.series.length > 0 ? (
            <MiniArea
              series={data.series}
              currency={data.currency}
              range={range}
            />
          ) : (
            <p className="py-6 text-center text-[11.5px] text-muted-foreground">
              No balance history yet.
            </p>
          )}
        </>
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

function MiniArea({
  series,
  currency,
  range,
}: {
  series: { date: string; net_worth_minor: number }[]
  currency: string
  range: Range
}) {
  const points = series.map((point) => ({
    date: new Date(point.date),
    value: point.net_worth_minor,
  }))
  const first = series[0]
  const last = series[series.length - 1]
  const summary = `Net worth over the ${RANGES.find((r) => r.value === range)?.label ?? range} range, from ${monthYear.format(new Date(first.date))} to ${monthYear.format(new Date(last.date))}, currently ${formatMinorUnits(last.net_worth_minor, currency)}.`

  return (
    <ChartA11y
      summary={summary}
      table={{
        columns: ['Date', 'Net worth'],
        rows: series.map((point) => [
          point.date,
          formatMinorUnits(point.net_worth_minor, currency),
        ]),
      }}
    >
      <AreaChart data={points} xDataKey="date" aspectRatio="16 / 5">
        <Area
          dataKey="value"
          stroke="var(--foreground)"
          fill="var(--foreground)"
          fillOpacity={0.06}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartA11y>
  )
}
