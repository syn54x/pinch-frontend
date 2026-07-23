import type * as React from 'react'
import { cn } from '@/lib/utils'

// Bar sparkline — CSS flex bars normalized to the series max. The other CP0
// small-scale-gate winner: bklit's BarChart emits negative <rect> heights at
// 30px (baseline math underflows), so tiny sparks pivoted to this fallback.
// Decorative by default (the value beside it carries meaning); pass `label` to
// expose it to assistive tech. Dashboard/net-worth account-row sparks (s6/s11).
function Sparkline({
  values,
  height = 30,
  label,
  color = 'var(--muted-foreground)',
  className,
  style,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  /** Bar heights; normalized against the largest value. */
  values: number[]
  /** Overall height in px. Default: 30 (the s6 dashboard spark). */
  height?: number
  /** Accessible label; omit to leave the spark decorative (aria-hidden). */
  label?: string
  /** Bar color. Default: a quiet neutral (matches the wireframe --fill). */
  color?: string
}) {
  const max = Math.max(1, ...values)
  // Expose to AT only when labelled; otherwise it's decorative (aria-hidden).
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const)
  return (
    <div
      data-slot="sparkline"
      {...a11y}
      className={cn('flex items-end gap-[3px]', className)}
      style={{ height, ...style }}
      {...props}
    >
      {values.map((v, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order series bars
          key={i}
          className="flex-1 rounded-t-[2px]"
          style={{
            height: `${(Math.max(0, v) / max) * 100}%`,
            backgroundColor: color,
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  )
}

export { Sparkline }
