import { useState } from 'react'
import type {
  RetroApplyTier,
  RulePreviewOut,
  TransactionOut,
} from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { formatMinorUnits } from '@/lib/money'
import { splitStatus } from '@/lib/split-draft'
import { cn } from '@/lib/utils'
import { CategoryPicker } from './category-picker'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { CreateCategorySheet } from './create-category-sheet'
import { formatDay } from './day-label'
import { PairCallout } from './pair-callout'
import { ProvenanceBadge } from './provenance-badge'
import { payeeOf } from './reviewer-model'
import { SplitEditor } from './split-editor'
import { TagEditor } from './tag-editor'
import type { useReviewController } from './use-review-controller'

// The ReviewerPanel (s7c): the reviewing VARIANT of the one inspector — the
// body where the focused unreviewed transaction is examined and corrected in
// place. One fixed skeleton (identity, category, Apply-to, tags, footer) whose
// middle content and footer verbs swap per state. Purely presentational:
// every value and verb arrives via the controller object, so every host
// (the Register's To-review tab and pane, the Dashboard Fix drawer) mounts the same body
// through TransactionInspector. Corrections stage here and ride ONE review
// call on Accept — no separate "save"; the decision SHAPES are exclusive
// (category OR split OR transfer, the API's 422), so staging one clears the
// others upstream.

export function ReviewerPanel({
  txn,
  reviewer,
}: {
  txn: TransactionOut
  reviewer: ReturnType<typeof useReviewController>
}) {
  const {
    correction,
    panel,
    createName,
    rulePreview,
    categories,
    categoriesPending,
    tagSuggestions,
    splitLines,
    counterpart,
    counterpartLabel,
    canMarkTransfer,
    transferChoices,
    accountLabel,
    busy: accepting,
    setCorrection: onCorrectionChange,
    openCategory: onOpenCategory,
    closeCategory: onCloseCategory,
    openCreateCategory: onOpenCreateCategory,
    backToPicker: onBackToPicker,
    accept: onAccept,
    setSplitLines: onSplitLinesChange,
    openSplit: onOpenSplit,
    mergeBack: onMergeBack,
    saveSplit: onSaveSplit,
    cancelSplit: onCancelSplit,
    consentTransfer: onConfirmTransfer,
    openTransfer: onOpenTransfer,
    markTransfer: onMarkTransfer,
    closeTransfer: onCloseTransfer,
  } = reviewer
  const account = accountLabel(txn.account_id)
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
      data-testid="reviewer-panel"
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
        {formatDay(txn.date)}
        {account !== undefined && <> · {account}</>}
        {' · '}
        {txn.pending ? 'pending' : 'posted'}
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
            {panel === 'create-category' ? (
              <CreateCategorySheet
                initialName={createName}
                parents={categories.filter((row) => row.parent_id === null)}
                onCreated={(created) => {
                  onCorrectionChange({ ...correction, category: created })
                  onCloseCategory()
                }}
                onBack={onBackToPicker}
              />
            ) : panel === 'category' ? (
              <CategoryPicker
                categories={categories}
                isPending={categoriesPending}
                onPick={(picked) => {
                  onCorrectionChange({ ...correction, category: picked })
                  onCloseCategory()
                }}
                onClose={onCloseCategory}
                onCreate={onOpenCreateCategory}
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
            onCreate={onOpenCreateCategory}
          />
        </div>
      )}
      {detected && !declining && panel === 'create-category' && (
        <div className="mt-2">
          <CreateCategorySheet
            initialName={createName}
            parents={categories.filter((row) => row.parent_id === null)}
            onCreated={(created) => {
              onCorrectionChange({ ...correction, category: created })
              onCloseCategory()
            }}
            onBack={onBackToPicker}
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

      {correction.category !== undefined &&
        !splitting &&
        panel !== 'category' &&
        panel !== 'create-category' && (
          <ApplyToBlock
            payee={payeeOf(txn)}
            ruleScope={correction.ruleScope}
            preview={rulePreview}
            onChange={(scope) => {
              const next = { ...correction }
              if (scope === undefined) delete next.ruleScope
              else next.ruleScope = scope
              onCorrectionChange(next)
            }}
          />
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
              {ruleVerb(correction.ruleScope, rulePreview) ??
                (corrected ? 'Accept correction · A' : 'Accept · A')}
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

/** The 8b footer verbs: name the consequence when a rule rides Accept. */
function ruleVerb(
  scope: RetroApplyTier | undefined,
  preview: RulePreviewOut | null,
): string | null {
  if (scope === undefined) return null
  if (scope === 'unreviewed') {
    return `Create rule & apply to ${preview?.unreviewed_count ?? 0} · A`
  }
  if (scope === 'full') {
    const total =
      (preview?.unreviewed_count ?? 0) + (preview?.reviewed_count ?? 0)
    return `Create rule & recategorize ${total} · A`
  }
  return 'Accept & create rule · A'
}

// #63 (wireframe 8b): the Apply-to block under an assigned category. "Make a
// rule" defaults to going-forward and says so plainly — Change scope expands
// the same three-way tiers the New Rule screen offers ("the inspector is
// just a shorter door into it"). Two clicks to touch history, one to not.
function ApplyToBlock({
  payee,
  ruleScope,
  preview,
  onChange,
}: {
  payee: string
  ruleScope: RetroApplyTier | undefined
  preview: RulePreviewOut | null
  onChange: (scope: RetroApplyTier | undefined) => void
}) {
  const [scopeOpen, setScopeOpen] = useState(false)
  const makingRule = ruleScope !== undefined
  const existing =
    (preview?.unreviewed_count ?? 0) + (preview?.reviewed_count ?? 0)
  return (
    <div data-testid="apply-to" className="mt-5">
      <div className="label-caps">Apply to</div>
      <div className="mt-1.5 grid gap-1.5">
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="radio"
            name="apply-to"
            checked={!makingRule}
            onChange={() => {
              onChange(undefined)
              setScopeOpen(false)
            }}
          />
          Just this transaction
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="radio"
            name="apply-to"
            checked={makingRule}
            onChange={() => onChange('forward')}
          />
          <span>
            All from {payee} — <span className="font-medium">make a rule</span>
          </span>
        </label>
        {makingRule && !scopeOpen && (
          <div className="ml-6 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span data-testid="rule-scope-summary">
              {ruleScope === 'forward'
                ? `Going forward only — ${existing} existing transaction${existing === 1 ? '' : 's'} stay as they are`
                : ruleScope === 'unreviewed'
                  ? `Also re-proposes the ${preview?.unreviewed_count ?? 0} still waiting to review`
                  : `Recategorizes all ${existing}, including ${preview?.reviewed_count ?? 0} already reviewed`}
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-foreground hover:underline"
              onClick={() => setScopeOpen(true)}
            >
              Change scope ›
            </button>
          </div>
        )}
        {makingRule && scopeOpen && (
          <div
            data-testid="rule-scope-options"
            className="ml-6 grid gap-1 text-[12.5px]"
          >
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="rule-scope"
                checked={ruleScope === 'forward'}
                onChange={() => onChange('forward')}
              />
              Nothing — going forward only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="rule-scope"
                checked={ruleScope === 'unreviewed'}
                onChange={() => onChange('unreviewed')}
              />
              The {preview?.unreviewed_count ?? 0} still waiting to review
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="rule-scope"
                checked={ruleScope === 'full'}
                onChange={() => onChange('full')}
              />
              All {existing}, including {preview?.reviewed_count ?? 0} you
              already reviewed
            </label>
            {ruleScope === 'full' && (preview?.reviewed_count ?? 0) > 0 && (
              <p
                data-testid="full-scope-warning"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11.5px]"
              >
                This overwrites {preview?.reviewed_count} decision
                {preview?.reviewed_count === 1 ? '' : 's'} you made. They stay
                reviewed — nothing returns to your queue. Logged as one entry in
                Learning.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
