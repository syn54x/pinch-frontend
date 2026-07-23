import type * as React from 'react'
import { cn } from '@/lib/utils'

// Progress ring — a CSS conic-gradient dial. This is the CP0 small-scale-gate
// winner: bklit's RingChart was too heavy and rough at 46px (motion + NumberFlow
// + visx for a static arc), so rings pivoted to this fallback and the decision
// is settled. Hueless by design — the arc is --progress (graphite in light,
// lavender in dark) on a --muted track, so it reads as progress, not a category.
// Debt payoff rings (s14) and any small progress dial.
function ProgressRing({
  value,
  size = 46,
  thickness = 6,
  label,
  children,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  /** Progress as a 0..1 fraction. */
  value: number
  /** Outer diameter in px. Default: 46 (the s14 debt ring). */
  size?: number
  /** Ring thickness in px (the center hole is `size - 2*thickness`). Default: 6 */
  thickness?: number
  /** Accessible label; defaults to the rounded percent. */
  label?: string
  /** Center content; defaults to the rounded percent. */
  children?: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const rounded = Math.round(pct)
  return (
    <div
      data-slot="progress-ring"
      role="img"
      aria-label={label ?? `${rounded}%`}
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <div
        aria-hidden
        className="size-full rounded-full"
        style={{
          background: `conic-gradient(var(--progress) 0 ${pct}%, var(--muted) ${pct}% 100%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute flex items-center justify-center rounded-full bg-card"
        style={{ inset: thickness }}
      >
        {children ?? (
          <span
            className="amount font-semibold"
            style={{ fontSize: Math.max(9, Math.round(size * 0.25)) }}
          >
            {rounded}%
          </span>
        )}
      </div>
    </div>
  )
}

export { ProgressRing }
