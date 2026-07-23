import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { netWorthReportOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { AccountReportOut, Delta } from '@/api/generated/types.gen'
import { NetWorthChart } from '@/components/net-worth/net-worth-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkline } from '@/components/ui/sparkline'
import { StatTile } from '@/components/ui/stat-tile'
import { formatMinorUnits } from '@/lib/money'
import {
  deltaGlyph,
  deltaTone,
  formatDeltaPercent,
  momReady,
  rangeSinceLabel,
} from '@/lib/net-worth'
import { cn } from '@/lib/utils'

type Range = '1m' | '6m' | '1y' | 'all'
const RANGES: { value: Range; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
]

type NetWorthSearch = { range?: Range }

export const Route = createFileRoute('/_authed/net-worth')({
  staticData: { title: 'Net Worth' },
  // The range lives in the URL so it survives reload and shares as a link; a
  // malformed hand-edit degrades to the default, never an error.
  validateSearch: (raw: Record<string, unknown>): NetWorthSearch => {
    const range = raw.range
    return range === '1m' || range === '6m' || range === '1y' || range === 'all'
      ? { range }
      : {}
  },
  component: NetWorthPage,
})

const TONE_CLASS = {
  positive: 'text-success',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
} as const

// F5 CP2 (#29, wireframe s11/s11e): net worth, its direction, and Penny's
// run-rate projection. Every number is real from the report; the projection and
// the MoM tile gate honestly when there isn't enough history yet. Range lives in
// the URL (default 6m). Liveness is invalidation + refocus, never polling.
function NetWorthPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const range: Range = search.range ?? '6m'

  const report = useQuery({
    ...netWorthReportOptions({ query: { range } }),
    // Keep the previous range's numbers on screen while the next loads —
    // switching ranges shouldn't flash a skeleton.
    placeholderData: keepPreviousData,
    throwOnError: true,
  })

  const data = report.data
  // Undefined only on the very first load (keepPreviousData holds the last
  // range's numbers through a switch); that's the skeleton.
  if (data === undefined) return <NetWorthSkeleton range={range} />
  const { currency, series } = data

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div data-testid="nw-hero" className="amount font-semibold text-3xl">
            {formatMinorUnits(data.net_worth_minor, currency)}
          </div>
          {series.length > 0 && (
            <HeroDelta
              delta={data.since_range_start}
              range={range}
              currency={currency}
            />
          )}
        </div>
        <RangeControl
          range={range}
          onChange={(next) =>
            navigate({ search: { range: next }, replace: true })
          }
        />
      </div>

      {series.length === 0 ? (
        <EmptyNetWorth />
      ) : (
        <>
          <NetWorthChart
            series={series}
            projection={data.projection}
            currency={currency}
          />

          <div data-testid="nw-tiles" className="grid grid-cols-3 gap-3">
            <StatTile
              label="Assets"
              value={
                <span className="text-success">
                  {formatMinorUnits(data.assets_minor, currency)}
                </span>
              }
            />
            <StatTile
              label="Liabilities"
              value={
                <span className="text-destructive">
                  {formatMinorUnits(data.liabilities_minor, currency)}
                </span>
              }
            />
            <MoMTile
              series={series}
              delta={data.month_to_date}
              currency={currency}
            />
          </div>

          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="label-caps">By account</h2>
            <div className="mt-2 flex flex-col">
              {data.accounts.map((account, i) => (
                <ByAccountRow
                  key={account.id}
                  account={account}
                  swatch={`var(--cat-${(i % 10) + 1})`}
                />
              ))}
            </div>
          </section>

          {data.excluded.length > 0 && (
            <p
              data-testid="nw-excluded-note"
              className="text-[11.5px] text-muted-foreground"
            >
              Excludes{' '}
              {data.excluded
                .map((e) => formatMinorUnits(e.balance_minor, e.currency))
                .join(', ')}{' '}
              — no {currency} rate to convert them yet.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function HeroDelta({
  delta,
  range,
  currency,
}: {
  delta: Delta
  range: Range
  currency: string
}) {
  const tone = deltaTone(delta.delta_minor)
  const percent = formatDeltaPercent(delta)
  return (
    <p className={cn('amount mt-1 text-sm', TONE_CLASS[tone])}>
      {deltaGlyph(delta.delta_minor)}{' '}
      {formatMinorUnits(Math.abs(delta.delta_minor), currency)}
      {percent !== null && ` · ${percent}`}{' '}
      <span className="text-muted-foreground">{rangeSinceLabel(range)}</span>
    </p>
  )
}

function MoMTile({
  series,
  delta,
  currency,
}: {
  series: { date: string; net_worth_minor: number }[]
  delta: Delta
  currency: string
}) {
  const ready = momReady(series, new Date())
  if (!ready) {
    return (
      <StatTile
        label="MoM change"
        value={<span className="text-muted-foreground">—</span>}
        delta="needs a full month"
        deltaTone="muted"
      />
    )
  }
  const tone = deltaTone(delta.delta_minor)
  const percent = formatDeltaPercent(delta)
  return (
    <StatTile
      label="MoM change"
      value={
        <span className={TONE_CLASS[tone]}>
          {deltaGlyph(delta.delta_minor)}{' '}
          {formatMinorUnits(Math.abs(delta.delta_minor), currency)}
        </span>
      }
      delta={percent ?? undefined}
      deltaTone={tone}
    />
  )
}

function ByAccountRow({
  account,
  swatch,
}: {
  account: AccountReportOut
  swatch: string
}) {
  const negative = account.balance_minor < 0
  return (
    <div
      data-testid="nw-account-row"
      className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: swatch }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {account.label}
      </span>
      <Sparkline
        className="w-20 shrink-0"
        height={22}
        values={account.series.map((p) => Math.abs(p.balance_minor))}
        label={`${account.label} balance trend`}
      />
      <span
        className={cn(
          'amount w-24 shrink-0 text-right text-[13px]',
          negative && 'text-destructive',
        )}
      >
        {formatMinorUnits(account.balance_minor, account.currency)}
      </span>
    </div>
  )
}

function RangeControl({
  range,
  onChange,
}: {
  range: Range
  onChange: (range: Range) => void
}) {
  return (
    <fieldset
      aria-label="Range"
      className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {RANGES.map((r) => {
        const active = r.value === range
        return (
          <button
            key={r.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(r.value)}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        )
      })}
    </fieldset>
  )
}

function EmptyNetWorth() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-10 text-center">
        <p className="font-medium">No net worth to chart yet</p>
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">
          Connect a bank or add an account and its balances, and your net worth
          and its trend will build here.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/connections">Connect a bank</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function NetWorthSkeleton({ range }: { range: Range }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-9 w-48" />
        <RangeControl range={range} onChange={() => {}} />
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}
