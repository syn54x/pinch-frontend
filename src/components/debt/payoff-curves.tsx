import type { PayoffProjections } from '@/api/generated/types.gen'
import { ChartA11y } from '@/components/chart-a11y'
import { Grid } from '@/components/charts/grid'
import { Line } from '@/components/charts/line'
import { LineChart } from '@/components/charts/line-chart'
import { formatMinorUnits } from '@/lib/money'

// Projected-balance curves (s15): the debt owed shrinking toward zero at your
// pace (solid) vs. the contract minimum (dashed). Both simulations step monthly
// from the same balance, so their points align by index. We plot the owed
// magnitude (falls to zero); the accessible table carries the real signed
// balance. Only rendered when the loan has terms (projections present).
export function PayoffCurves({
  projections,
  currency,
}: {
  projections: PayoffProjections
  currency: string
}) {
  const pace = projections.at_pace
  const minimum = projections.at_minimum
  const length = Math.max(pace.series.length, minimum?.series.length ?? 0)

  const data: {
    date: Date
    pace: number | undefined
    minimum: number | undefined
  }[] = []
  for (let i = 0; i < length; i++) {
    const p = pace.series[i]
    const m = minimum?.series[i]
    const anchor = p ?? m
    if (anchor === undefined) continue
    data.push({
      date: new Date(`${anchor.date}T00:00:00`),
      pace: p ? Math.abs(p.balance_minor) : undefined,
      minimum: m ? Math.abs(m.balance_minor) : undefined,
    })
  }

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="label-caps mb-2">Projected balance</div>
      <ChartA11y
        summary={`Projected balance owed over time, at your pace${minimum ? ' versus the contract minimum' : ''}.`}
        table={{
          columns: minimum
            ? ['Month', 'At pace', 'Minimum']
            : ['Month', 'At pace'],
          rows: data.map((d) => {
            const month = d.date.toISOString().slice(0, 7)
            const paceCell =
              d.pace === undefined
                ? 'paid off'
                : formatMinorUnits(-d.pace, currency)
            return minimum
              ? [
                  month,
                  paceCell,
                  d.minimum === undefined
                    ? '—'
                    : formatMinorUnits(-d.minimum, currency),
                ]
              : [month, paceCell]
          }),
        }}
      >
        <LineChart data={data} xDataKey="date" aspectRatio="16 / 5">
          <Grid />
          {minimum && (
            <Line
              dataKey="minimum"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              dashFromIndex={0}
              dashArray="5,4"
            />
          )}
          <Line dataKey="pace" stroke="var(--foreground)" strokeWidth={2.5} />
        </LineChart>
      </ChartA11y>
      {minimum && (
        <div className="mt-2 flex gap-4 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-foreground" aria-hidden />
            Your pace
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0 w-4 border-muted-foreground border-t border-dashed"
              aria-hidden
            />
            Minimum
          </span>
        </div>
      )}
    </section>
  )
}
