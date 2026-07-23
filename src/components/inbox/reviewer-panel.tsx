import type { CategoryOut, TransactionOut } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { formatMinorUnits } from '@/lib/money'
import { type SplitDraftLine, splitStatus } from '@/lib/split-draft'
import { cn } from '@/lib/utils'
import { CategoryPicker } from './category-picker'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { formatDay } from './day-label'
import { PairCallout } from './pair-callout'
import { ProvenanceBadge } from './provenance-badge'
import { type Correction, payeeOf, type ReviewPanel } from './reviewer-model'
import { SplitEditor } from './split-editor'
import { TagEditor } from './tag-editor'

// The ReviewerPanel (s7c): the self-contained body where the focused proposal
// is examined and corrected in place — one fixed skeleton (identity, category,
// tags, footer) whose middle content and footer verbs swap per state. Purely
// presentational: every value and verb arrives via props (from
// useReviewController), so the Inbox pane and the Dashboard Fix drawer mount the
// same body. Corrections stage here and ride ONE review call on Accept — no
// separate "save"; the decision SHAPES are exclusive (category OR split OR
// transfer, the API's 422), so staging one clears the others upstream.

export function ReviewerPanel({
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
  onSaveSplit,
  onCancelSplit,
  counterpart,
  counterpartLabel,
  onConfirmTransfer,
}: {
  txn: TransactionOut
  correction: Correction
  onCorrectionChange: (correction: Correction) => void
  panel: ReviewPanel | null
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
  /** ↩ — close the editor keeping the (valid) document staged. */
  onSaveSplit: () => void
  /** Escape / Cancel — discard this editing session's changes. */
  onCancelSplit: () => void
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
          onSave={onSaveSplit}
          onCancel={onCancelSplit}
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
        {panel === 'split' ? (
          // Editing has its own verbs (wireframe s7b): Save keeps the valid
          // document staged, Cancel discards this session's edits — the
          // review itself waits for Accept back in the resting state.
          <>
            <Button
              className="flex-1"
              onClick={onSaveSplit}
              disabled={!splitValid}
              title={
                splitValid
                  ? undefined
                  : 'Split lines must match the total first'
              }
            >
              Save split · ↩
            </Button>
            <Button variant="outline" onClick={onCancelSplit}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              className="flex-1"
              onClick={onAccept}
              disabled={accepting || !splitValid}
              title={
                splitValid
                  ? undefined
                  : 'Split lines must match the total first'
              }
            >
              {corrected ? 'Accept correction · A' : 'Accept · A'}
            </Button>
            {splitting && (
              <Button variant="outline" onClick={onOpenSplit}>
                Edit split
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
