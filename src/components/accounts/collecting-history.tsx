import type { SeriesPoint } from '@/api/generated/types.gen'
import { ChartA11y } from '@/components/chart-a11y'
import { Area } from '@/components/charts/area'
import { AreaChart } from '@/components/charts/area-chart'
import { formatMonthDay } from '@/lib/dates'
import { formatMinorUnits } from '@/lib/money'
import {
  historyFraction,
  type NetWorthRange,
  observedSeries,
} from '@/lib/net-worth'

// The collecting-history state (F10 CP2, wireframe 3b): under ~two months of
// observed span, the chart refuses to dress six weeks up as a year. Observed
// history (the server zero-pads fixed ranges to their window — the padding is
// trimmed, not charted) draws at its real share of the range's window,
// right-aligned against "now"; the rest of the axis says plainly that nothing
// existed before the first sync. Real balances from day one — only the
// *stretch* is withheld.
export function CollectingHistory({
  series,
  currency,
  range,
}: {
  series: SeriesPoint[]
  currency: string
  range: NetWorthRange
}) {
  const observed = observedSeries(series)
  const first = observed[0]
  const last = observed[observed.length - 1]
  const fraction = historyFraction(series, range)
  const emptyPercent = `${(1 - fraction) * 100}%`

  const history = observed.map((p) => ({
    date: new Date(p.date),
    value: p.net_worth_minor,
  }))

  const summary = `Net worth since ${formatMonthDay(first.date)}, currently ${formatMinorUnits(
    last.net_worth_minor,
    currency,
  )}. History is still collecting — there is no data before the first sync.`

  return (
    <div
      data-testid="nw-collecting"
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <ChartA11y
        summary={summary}
        table={{
          columns: ['Date', 'Net worth'],
          rows: observed.map((p) => [
            p.date,
            formatMinorUnits(p.net_worth_minor, currency),
          ]),
        }}
      >
        <div className="relative" style={{ aspectRatio: '16 / 5' }}>
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 flex items-center justify-center"
            style={{ width: emptyPercent }}
          >
            <span className="px-3 text-center font-mono text-[11px] text-muted-foreground">
              no history before you connected
            </span>
          </div>
          <div
            aria-hidden
            data-testid="nw-first-sync-divider"
            className="pointer-events-none absolute inset-y-0 w-px bg-border"
            style={{ left: emptyPercent }}
          />
          <div
            className="absolute inset-y-0 right-0"
            style={{ width: `${fraction * 100}%` }}
          >
            {observed.length >= 2 && (
              <AreaChart
                data={history}
                xDataKey="date"
                style={{ aspectRatio: 'auto', height: '100%' }}
              >
                <Area
                  dataKey="value"
                  stroke="var(--foreground)"
                  fill="var(--foreground)"
                  fillOpacity={0.06}
                  strokeWidth={2.5}
                />
              </AreaChart>
            )}
          </div>
        </div>
      </ChartA11y>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span data-testid="nw-first-sync" className="font-mono">
          {formatMonthDay(first.date)} · first sync
        </span>
        <span>now</span>
      </div>
    </div>
  )
}
