import type { TransactionOut } from '@/api/generated/types.gen'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { payeeOf } from './inspector'
import { ProvenanceBadge } from './provenance-badge'

// One proposal in the queue (wireframe #7): payee over the catpill, then
// the provenance badge and the amount — tabular, right-aligned, direction-
// colored. The focused row wears the wireframe's selection treatment
// (selected bg + accent left edge); focus itself lives on the listbox
// (aria-activedescendant), so this row is pure rendering + pointer target.

export function proposalRowDomId(id: string): string {
  return `inbox-row-${id}`
}

export function ProposalRow({
  txn,
  focused,
  onFocus,
}: {
  txn: TransactionOut
  focused: boolean
  onFocus: () => void
}) {
  const proposal = txn.proposal
  const negative = txn.amount_minor < 0

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard reaches rows via the listbox's J/K, not per-row handlers
    <div
      id={proposalRowDomId(txn.id)}
      data-testid="inbox-row"
      role="option"
      aria-selected={focused}
      tabIndex={-1}
      className={cn(
        'flex cursor-default items-center gap-3 border-l-2 border-l-transparent px-4 py-2.5',
        focused && 'border-l-primary bg-accent',
      )}
      onClick={onFocus}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[12.5px]">{payeeOf(txn)}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {proposal?.proposed_transfer ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px]">
              <span
                aria-hidden
                className="size-2 rounded-[3px] bg-muted-foreground"
              />
              Transfer
            </span>
          ) : proposal?.category ? (
            <CategoryPill category={proposal.category} />
          ) : (
            <UncategorizedPill />
          )}
        </div>
      </div>
      <ProvenanceBadge provenance={proposal?.provenance ?? 'none'} />
      <span
        className={cn(
          'amount whitespace-nowrap text-right text-[12.5px]',
          negative ? 'text-destructive' : 'text-success',
        )}
      >
        {formatMinorUnits(txn.amount_minor, txn.currency)}
      </span>
    </div>
  )
}
