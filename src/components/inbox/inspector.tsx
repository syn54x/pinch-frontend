import type {
  CategoryOut,
  CategoryRef,
  TransactionOut,
} from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import type { InboxPanel } from '@/lib/inbox-reducer'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CategoryPicker } from './category-picker'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { formatDay } from './day-label'
import { ProvenanceBadge } from './provenance-badge'
import { TagEditor } from './tag-editor'

// The Inspector (CONTEXT.md): the pane beside the queue where the focused
// proposal is examined and corrected in place. In the Inbox it carries the
// review verb. Corrections stage here and ride ONE review call on Accept —
// there is no separate "save correction" motion (#18). CP3 extends this
// pane with the deep verbs (split editor, transfer consent) as further
// sections/panels; the section layout and the panel union are the seams.

/** Staged corrections for the focused transaction. An absent field means
 * "the proposal's value" — exactly the review contract's field-present
 * merge. (`category` keeps the full ref so the staged pill can render.) */
export interface Correction {
  category?: CategoryRef
  tags?: string[]
}

export function payeeOf(txn: TransactionOut): string {
  return txn.proposal?.display_name ?? txn.display_name ?? txn.description_raw
}

export function Inspector({
  txn,
  correction,
  onCorrectionChange,
  panel,
  onOpenCategory,
  onCloseCategory,
  onAccept,
  accepting,
  categories,
  categoriesPending,
  tagSuggestions,
}: {
  txn: TransactionOut
  correction: Correction
  onCorrectionChange: (correction: Correction) => void
  panel: InboxPanel | null
  onOpenCategory: () => void
  onCloseCategory: () => void
  onAccept: () => void
  accepting: boolean
  categories: CategoryOut[]
  categoriesPending: boolean
  tagSuggestions: string[]
}) {
  const proposal = txn.proposal
  const category = correction.category ?? proposal?.category ?? null
  const tags = correction.tags ?? proposal?.tags ?? []
  const corrected =
    correction.category !== undefined || correction.tags !== undefined
  const negative = txn.amount_minor < 0

  return (
    <div
      data-testid="inbox-inspector"
      className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <div className="label-caps">Inspecting</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="truncate font-semibold text-base">{payeeOf(txn)}</span>
        <ProvenanceBadge provenance={proposal?.provenance ?? 'none'} />
      </div>
      <div
        className={cn(
          'amount mt-0.5 font-semibold text-2xl',
          negative ? 'text-destructive' : 'text-success',
        )}
      >
        {formatMinorUnits(txn.amount_minor, txn.currency)}
      </div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">
        {formatDay(txn.date)} · {txn.pending ? 'pending' : 'posted'}
      </div>

      <div className="label-caps mt-5">Category</div>
      <div className="mt-1.5 flex items-center gap-2">
        {proposal?.proposed_transfer ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px]">
            <span
              aria-hidden
              className="size-2 rounded-[3px] bg-muted-foreground"
            />
            Transfer
          </span>
        ) : category !== null ? (
          <CategoryPill category={category} />
        ) : (
          <UncategorizedPill />
        )}
        {correction.category !== undefined && (
          <span className="text-[11.5px] text-muted-foreground">corrected</span>
        )}
      </div>
      {panel === 'category' ? (
        <CategoryPicker
          categories={categories}
          isPending={categoriesPending}
          onPick={(picked) => {
            onCorrectionChange({ ...correction, category: picked })
            onCloseCategory()
          }}
          onClose={onCloseCategory}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 self-start"
          onClick={onOpenCategory}
        >
          Correct category · C
        </Button>
      )}

      <div className="label-caps mt-5">Tags</div>
      <div className="mt-1.5">
        <TagEditor
          tags={tags}
          suggestions={tagSuggestions}
          onChange={(next) => onCorrectionChange({ ...correction, tags: next })}
        />
      </div>

      <div className="mt-auto pt-5">
        <Button className="w-full" onClick={onAccept} disabled={accepting}>
          {corrected ? 'Accept correction · A' : 'Accept · A'}
        </Button>
      </div>
    </div>
  )
}
