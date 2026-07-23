import type * as React from 'react'
import { cn } from '@/lib/utils'

// The KPI unit shared by every F5 surface's tile row: a mono-caps label, a big
// tabular value, an optional delta, and a slot for a sparkline or a breakdown.
// Values arrive pre-formatted (callers use formatMinorUnits) — StatTile owns
// layout and type, not number formatting.

type DeltaTone = 'positive' | 'negative' | 'muted'

const DELTA_TONE: Record<DeltaTone, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
}

function StatTile({
  label,
  value,
  delta,
  deltaTone = 'muted',
  children,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode
  value: React.ReactNode
  delta?: React.ReactNode
  deltaTone?: DeltaTone
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        'flex flex-col gap-1.5 overflow-hidden rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10',
        className,
      )}
      {...props}
    >
      <span className="label-caps" data-slot="stat-tile-label">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className="amount text-2xl leading-none"
          data-slot="stat-tile-value"
        >
          {value}
        </span>
        {delta != null && (
          <span
            className={cn('text-xs font-medium', DELTA_TONE[deltaTone])}
            data-slot="stat-tile-delta"
          >
            {delta}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export { StatTile }
