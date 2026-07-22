import type { TransactionOut } from '@/api/generated/types.gen'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { formatDay } from './day-label'

// The detected pair, said out loud (wireframe #7's Venmo → Ally callout):
// a det-provenance row's counterpart shown inline, in the canonical voice
// — "pairs with … — both excluded from spending". Rendered under the
// queue row and inside the Inspector's transfer consent; one component so
// the copy can never drift between the two.

export function PairCallout({
  counterpart,
  /** Where the other leg lives — the account's label, falling back to the
   * counterpart's payee while accounts load. */
  counterpartLabel,
  className,
}: {
  counterpart: TransactionOut
  counterpartLabel: string
  className?: string
}) {
  return (
    <div
      data-testid="pair-callout"
      className={cn(
        'flex items-start gap-2 bg-muted/50 py-1.5 pr-4 pl-11 text-[11.5px] text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden>↳</span>
      <span className="min-w-0">
        pairs with{' '}
        <b className="font-semibold text-foreground">
          {counterpartLabel} ·{' '}
          <span className="amount">
            {/* Explicitly signed (wireframe: "+$120.00") — the + is the
             * point: the other leg moves the other way. */}
            {counterpart.amount_minor < 0 ? '−' : '+'}
            {formatMinorUnits(
              Math.abs(counterpart.amount_minor),
              counterpart.currency,
            )}
          </span>{' '}
          · {formatDay(counterpart.date)}
        </b>{' '}
        — both excluded from spending
      </span>
    </div>
  )
}
