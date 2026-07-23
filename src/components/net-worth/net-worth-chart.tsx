import { TrendingUp } from 'lucide-react'
import type { Projection, SeriesPoint } from '@/api/generated/types.gen'
import { ChartA11y } from '@/components/chart-a11y'
import { Area } from '@/components/charts/area'
import { AreaChart } from '@/components/charts/area-chart'
import { Grid } from '@/components/charts/grid'
import { ProjectionLine } from '@/components/charts/projection-line'
import { formatMinorUnits } from '@/lib/money'
import { showProjection } from '@/lib/net-worth'

const monthYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

function labelFor(iso: string): string {
  return monthYear.format(new Date(iso))
}

// The Net Worth chart (s11 / s11e): a solid history area with Penny's dashed
// run-rate projection past a "now" divider. History is always real; the
// projection is gated — below 14 days of span it withholds the dashed line and
// shows the "not ready" card instead (never a ruler through two dots). The
// accessible truth lives in the ChartA11y summary + hidden table, which the e2e
// asserts against; the SVG carries no semantics of its own.
export function NetWorthChart({
  series,
  projection,
  currency,
}: {
  series: SeriesPoint[]
  projection: Projection | null
  currency: string
}) {
  const projecting = showProjection(series, projection)

  const history = series.map((p) => ({
    date: new Date(p.date),
    value: p.net_worth_minor,
  }))
  const first = series[0]
  const last = series[series.length - 1]

  // The projection line starts at the last real point so it connects visually.
  const projectionPoints =
    projecting && projection !== null
      ? [
          { date: new Date(last.date), value: last.net_worth_minor },
          ...projection.series.map((p) => ({
            date: new Date(p.date),
            value: p.net_worth_minor,
          })),
        ]
      : null

  // The divider sits at "now" (the last real point) across the full plotted
  // domain (history → projection endpoint). Fraction of the x-range; a small
  // margin offset is acceptable (no y-axis, so the plot nearly fills the box).
  const endpoint = projection?.endpoint
  const nowFraction =
    projecting && endpoint !== undefined
      ? (Date.parse(last.date) - Date.parse(first.date)) /
        (Date.parse(endpoint.date) - Date.parse(first.date))
      : null

  const summary = projecting
    ? `Net worth from ${labelFor(first.date)} to ${labelFor(last.date)}, currently ${formatMinorUnits(last.net_worth_minor, currency)}, with Penny's run-rate projection to ${labelFor(endpoint?.date ?? last.date)}.`
    : `Net worth from ${labelFor(first.date)} to ${labelFor(last.date)}, currently ${formatMinorUnits(last.net_worth_minor, currency)}. History is still collecting — no projection yet.`

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <ChartA11y
          summary={summary}
          table={{
            columns: ['Date', 'Net worth'],
            rows: series.map((p) => [
              p.date,
              formatMinorUnits(p.net_worth_minor, currency),
            ]),
          }}
        >
          <div className="relative">
            <AreaChart data={history} xDataKey="date" aspectRatio="16 / 5">
              <Grid />
              <Area
                dataKey="value"
                stroke="var(--foreground)"
                fill="var(--foreground)"
                fillOpacity={0.06}
                strokeWidth={2.5}
              />
              {projectionPoints !== null && (
                <ProjectionLine
                  data={projectionPoints}
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
            {nowFraction !== null && (
              <div
                aria-hidden
                data-testid="nw-now-divider"
                className="pointer-events-none absolute inset-y-0 w-px bg-border"
                style={{ left: `${nowFraction * 100}%` }}
              />
            )}
          </div>
        </ChartA11y>
        <div className="mt-2 flex justify-between text-[11.5px] text-muted-foreground">
          <span>{labelFor(first.date)}</span>
          <span>now</span>
          {projecting && endpoint !== undefined ? (
            <span className="text-success">
              projected · {labelFor(endpoint.date)}
            </span>
          ) : (
            <span aria-hidden />
          )}
        </div>
      </div>

      {projecting ? (
        <p className="text-[11.5px] text-muted-foreground">
          <span aria-hidden>↑ </span>solid = balance history · dashed = Penny's
          projection from your run-rate
        </p>
      ) : (
        <ProjectionNotReady />
      )}
    </div>
  )
}

// s11e: the projection gate's honest early state — real balances from day one,
// the forecast withheld until there's enough signal to trust it.
function ProjectionNotReady() {
  return (
    <div
      data-testid="nw-projection-not-ready"
      className="flex items-start gap-3 rounded-xl border border-dashed p-4"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-sm">Projection not ready yet</p>
        <p className="mt-0.5 max-w-md text-[11.5px] text-muted-foreground">
          Penny forecasts net worth from your run-rate. There isn't enough
          signal yet — the dashed projection line appears after about two weeks
          of history. Balances are real from day one; the trend fills in as
          history accrues.
        </p>
      </div>
    </div>
  )
}
