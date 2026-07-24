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
  canMarkTransfer,
  transferChoices,
  onOpenTransfer,
  onMarkTransfer,
  onCloseTransfer,
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
  /** The manual transfer verb — rows with NO detected pairing. */
  canMarkTransfer: boolean
  /** Linkable queue rows for the manual picker, with their account labels. */
  transferChoices: { txn: TransactionOut; label: string }[]
  onOpenTransfer: () => void
  /** A picked counterpart id links both legs; null marks it untracked. */
  onMarkTransfer: (counterpartId: string | null) => void
  onCloseTransfer: () => void
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

      {panel === 'transfer' && (
        <div data-testid="transfer-picker" className="mt-5">
          <div className="label-caps">Mark as transfer</div>
          {transferChoices.length > 0 ? (
            <>
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                Link the other leg — same amount, the other direction:
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {transferChoices.map(({ txn: candidate, label }) => (
                  <Button
                    key={candidate.id}
                    variant="outline"
                    size="sm"
                    className="justify-between"
                    disabled={accepting}
                    onClick={() => onMarkTransfer(candidate.id)}
                    data-testid="transfer-choice"
                  >
                    <span className="truncate">
                      {label} · {formatDay(candidate.date)}
                    </span>
                    <span className="amount">
                      {formatMinorUnits(
                        candidate.amount_minor,
                        candidate.currency,
                      )}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              No linkable leg in the queue — a linked pair needs the same amount
              in the other direction, on another account.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={accepting}
              onClick={() => onMarkTransfer(null)}
              data-testid="transfer-untracked"
            >
              The other side isn't in Pinch
            </Button>
            <Button variant="outline" size="sm" onClick={onCloseTransfer}>
              Cancel · Esc
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Transfers are excluded from spending. Linking a leg reviews both
            sides in one act.
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
        <div className="mt-3 flex gap-2 self-start">
          <Button variant="outline" size="sm" onClick={onOpenSplit}>
            Split · S
          </Button>
          {canMarkTransfer && panel !== 'transfer' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTransfer}
              data-testid="mark-transfer"
            >
              Transfer · T
            </Button>
          )}
        </div>
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
