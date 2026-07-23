import { TriangleAlert } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

// A warning chip on the --warning token, self-tinted like the provenance badge.
// Status color always ships with an icon + label (never color alone — the
// dataviz status rule), so a leading icon is built in. Used for the debt
// partial-terms markers (*_excluded_count) and other "heads up" affordances.
function WarnChip({
  className,
  icon,
  children,
  ...props
}: React.ComponentProps<'span'> & { icon?: React.ReactNode }) {
  return (
    <span
      data-slot="warn-chip"
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-4xl px-1.5 py-0.5 text-xs font-medium text-warning',
        'bg-[color-mix(in_oklch,currentColor_13%,transparent)] dark:bg-[color-mix(in_oklch,currentColor_20%,transparent)] dark:shadow-[inset_0_0_0_1px_color-mix(in_oklch,currentColor_30%,transparent)]',
        '[&>svg]:pointer-events-none [&>svg]:size-3',
        className,
      )}
      {...props}
    >
      {icon ?? <TriangleAlert aria-hidden />}
      {children}
    </span>
  )
}

export { WarnChip }
