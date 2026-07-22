import type {
  CategoryOut,
  CategoryRef,
  TransactionOut,
} from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import type { InboxPanel } from '@/lib/inbox-reducer'
import { formatMinorUnits } from '@/lib/money'
import { type SplitDraftLine, splitStatus } from '@/lib/split-draft'
import { cn } from '@/lib/utils'
import { CategoryPicker } from './category-picker'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { formatDay } from './day-label'
import { PairCallout } from './pair-callout'
import { ProvenanceBadge } from './provenance-badge'
import { SplitEditor } from './split-editor'
import { TagEditor } from './tag-editor'

// The Inspector (CONTEXT.md): the pane beside the queue where the focused
// proposal is examined and corrected in place. In the Inbox it carries the
// review verb. Corrections stage here and ride ONE review call on Accept —
// there is no separate "save correction" motion (#18). CP3 adds the deep
// verbs: the split editor (S) and transfer consent (T) — still the same
// one-shot call; the decision SHAPES are exclusive (a review is a category
// OR a split document OR a transfer, the API's 422), so staging one clears
// the others upstream.

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
  splitLines,
  onSplitLinesChange,
  onOpenSplit,
  onMergeBack,
  counterpart,
  counterpartLabel,
  onConfirmTransfer,
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
  /** The staged split draft for THIS transaction — null when unsplit. */
  splitLines: SplitDraftLine[] | null
  onSplitLinesChange: (lines: SplitDraftLine[]) => void
  onOpenSplit: () => void
  onMergeBack: () => void
  /** The detected pair's other leg (det rows only; null while loading). */
  counterpart: TransactionOut | null
  counterpartLabel: string | null
  onConfirmTransfer: () => void
}) {
  const proposal = txn.proposal
  const category = correction.category ?? proposal?.category ?? null
  const tags = correction.tags ?? proposal?.tags ?? []
  const corrected =
    correction.category !== undefined || correction.tags !== undefined
  const negative = txn.amount_minor < 0
  const detected =
    proposal?.proposed_transfer === true &&
    proposal.counterpart_transaction_id != null
  // Staging a category on a det row IS the decline (the review contract has
  // no decline field — a different positive decision withdraws the mirror).
  const declining = detected && correction.category !== undefined
  const splitting = splitLines !== null
  const splitValid =
    splitLines === null || splitStatus(splitLines, txn).valid === true

  return (
    <div
      data-testid="inbox-inspector"
      className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <div className="label-caps">Inspecting</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="truncate font-semibold text-base">{payeeOf(txn)}</span>
        {splitting && (
          <span className="shrink-0 rounded-full border px-2 py-px text-[10px] text-muted-foreground">
            split · {splitLines.length} lines
          </span>
        )}
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

      {detected && !declining && (
        <div data-testid="transfer-consent" className="mt-5">
          <div className="label-caps">Transfer</div>
          {counterpart !== null ? (
            <PairCallout
              counterpart={counterpart}
              counterpartLabel={counterpartLabel ?? payeeOf(counterpart)}
              className="mt-1.5 rounded-md pl-4"
            />
          ) : (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Loading the paired transaction…
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={accepting}
              onClick={onConfirmTransfer}
              data-testid="confirm-transfer"
            >
              Confirm transfer · T
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={accepting}
              onClick={onOpenCategory}
            >
              Not a transfer · C
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            One consent reviews both sides. Picking a category instead declines
            the pairing — it won’t be proposed again.
          </p>
        </div>
      )}

      {panel === 'split' || (splitting && panel !== 'category') ? (
        <SplitEditor
          txn={txn}
          lines={splitLines ?? []}
          editing={panel === 'split'}
          onChange={onSplitLinesChange}
          onMergeBack={onMergeBack}
          categories={categories}
          categoriesPending={categoriesPending}
        />
      ) : (
        (!detected || declining) && (
          <>
            <div className="label-caps mt-5">Category</div>
            <div className="mt-1.5 flex items-center gap-2">
              {detected && !declining ? null : category !== null ? (
                <CategoryPill category={category} />
              ) : (
                <UncategorizedPill />
              )}
              {correction.category !== undefined && (
                <span className="text-[11.5px] text-muted-foreground">
                  {declining ? 'corrected — declines the pairing' : 'corrected'}
                </span>
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
          </>
        )
      )}

      {detected && !declining && panel === 'category' && (
        <div className="mt-2">
          <CategoryPicker
            categories={categories}
            isPending={categoriesPending}
            onPick={(picked) => {
              onCorrectionChange({ ...correction, category: picked })
              onCloseCategory()
            }}
            onClose={onCloseCategory}
          />
        </div>
      )}

      {!splitting && !detected && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 self-start"
          onClick={onOpenSplit}
        >
          Split · S
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

      <div className="mt-auto flex gap-2 pt-5">
        <Button
          className="flex-1"
          onClick={onAccept}
          disabled={accepting || !splitValid}
          title={
            splitValid ? undefined : 'Split lines must match the total first'
          }
        >
          {splitting
            ? 'Accept split · A'
            : corrected
              ? 'Accept correction · A'
              : 'Accept · A'}
        </Button>
        {splitting && panel !== 'split' && (
          <Button variant="outline" onClick={onOpenSplit}>
            Edit split
          </Button>
        )}
      </div>
    </div>
  )
}
