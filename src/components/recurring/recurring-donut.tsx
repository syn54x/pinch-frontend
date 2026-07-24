import type { BucketSlice } from '@/api/generated/types.gen'
import { ChartA11y } from '@/components/chart-a11y'
import { PieChart } from '@/components/charts/pie-chart'
import { PieSlice } from '@/components/charts/pie-slice'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

// One donut hue per bucket, from the categorical ramp — the slice and its legend
// swatch read the same color (identity, not chrome).
function bucketColor(index: number): string {
  return `var(--cat-${(index % 10) + 1})`
}

// The "Recurring by category" donut (s12): monthly recurring split by bucket,
// with the total in the hole. bklit's PieCenter animates a raw number (no
// minor-unit formatting), so the center is our own overlay with exact money.
// Identity lives in the ChartA11y summary + hidden table; the SVG is decorative.
export function RecurringDonut({
  buckets,
  currency,
}: {
  buckets: BucketSlice[]
  currency: string
}) {
  const slices = buckets.map((b, i) => ({
    label: b.bucket ?? 'Uncategorized',
    value: b.monthly_minor,
    color: bucketColor(i),
  }))
  const total = slices.reduce((sum, s) => sum + s.value, 0)

  return (
    <section className="flex items-center gap-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="relative size-[128px] shrink-0">
        <ChartA11y
          summary={`Monthly recurring by category, ${formatMinorUnits(total, currency)} total across ${slices.length} categories.`}
          table={{
            columns: ['Category', 'Monthly'],
            rows: slices.map((s) => [
              s.label,
              formatMinorUnits(s.value, currency),
            ]),
          }}
        >
          <PieChart
            data={slices}
            innerRadius={44}
            size={128}
            padAngle={0.015}
            cornerRadius={3}
          >
            {slices.map((s, i) => (
              <PieSlice
                key={s.label}
                index={i}
                showGlow={false}
                hoverEffect="none"
              />
            ))}
          </PieChart>
        </ChartA11y>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="label-caps">/mo</span>
          <span className="amount font-semibold text-sm">
            {formatMinorUnits(total, currency)}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        <li className="label-caps mb-0.5">Recurring by category</li>
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className={cn('amount text-muted-foreground')}>
              {formatMinorUnits(s.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
