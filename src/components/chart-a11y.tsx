import type * as React from 'react'
import { cn } from '@/lib/utils'

// The accessibility seam every chart wraps itself in. A chart's SVG is opaque to
// assistive tech, so identity + data live here instead: an aria-label summary on
// the figure and a visually-hidden data table screen readers can walk. This is
// also the surface the e2e specs assert against (aria-label, the hidden table,
// and the tooltip content bklit renders) — charts stay screenshot-free.

export interface ChartA11yTable {
  /** Column headers, left-to-right (e.g. ["Month", "Balance"]). */
  columns: React.ReactNode[]
  /** One array of cells per row, aligned to columns. */
  rows: React.ReactNode[][]
  /** Optional table caption; falls back to the figure summary. */
  caption?: React.ReactNode
}

function ChartA11y({
  summary,
  table,
  children,
  className,
  ...props
}: React.ComponentProps<'figure'> & {
  /** One-sentence description of what the chart shows (the aria-label). */
  summary: string
  /** The underlying data, exposed to screen readers as a hidden table. */
  table?: ChartA11yTable
}) {
  return (
    <figure
      data-slot="chart-a11y"
      aria-label={summary}
      className={cn('relative m-0', className)}
      {...props}
    >
      {children}
      {table && (
        <table
          className="sr-only"
          data-slot="chart-a11y-table"
          data-testid="chart-data-table"
        >
          <caption>{table.caption ?? summary}</caption>
          <thead>
            <tr>
              {table.columns.map((col, i) => (
                // Column order is the identity here; index keys are correct.
                // biome-ignore lint/suspicious/noArrayIndexKey: positional columns
                <th key={i} scope="col">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
              <tr key={r}>
                {row.map((cell, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional cells
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}

export { ChartA11y }
