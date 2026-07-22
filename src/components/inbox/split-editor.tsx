import { useState } from 'react'
import type { CategoryOut, TransactionOut } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMinorUnits } from '@/lib/money'
import {
  emptySplitLine,
  parseAmountInput,
  type SplitDraftLine,
  splitStatus,
} from '@/lib/split-draft'
import { cn } from '@/lib/utils'
import { CategoryPicker } from './category-picker'
import { CategoryPill, UncategorizedPill } from './category-pill'
import { ProvenanceBadge } from './provenance-badge'

// The split editor (wireframe #7's Costco Inspector, F3 CP3): the staged
// draft's lines — each with its own catpill and provenance, and an unsigned
// magnitude input the parent's sign wraps — over the lines-vs-total cue.
// The cue and the Accept gate both read `splitStatus`, the single truth in
// lib/split-draft.ts: a mismatched document never reaches the review call.
//
// Two renderings of one card: `editing` (the open S panel — inputs, per-line
// pickers, Add line) and the staged summary (static lines, the wireframe's
// resting state behind "Edit split"). Merge back restores the single,
// unsplit line either way.

export function SplitEditor({
  txn,
  lines,
  editing,
  onChange,
  onMergeBack,
  onSave,
  onCancel,
  categories,
  categoriesPending,
}: {
  txn: TransactionOut
  lines: SplitDraftLine[]
  editing: boolean
  onChange: (lines: SplitDraftLine[]) => void
  onMergeBack: () => void
  /** ↩ while editing — close the editor keeping the (valid) document. */
  onSave: () => void
  /** Escape while editing — discard this editing session's changes. */
  onCancel: () => void
  categories: CategoryOut[]
  categoriesPending: boolean
}) {
  // Which line's category picker is open — one at a time, editor-local.
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  const status = splitStatus(lines, txn)
  const negative = txn.amount_minor < 0
  const sign = negative ? '−' : '+'

  function setLine(index: number, next: SplitDraftLine) {
    onChange(lines.map((line, i) => (i === index ? next : line)))
  }

  // ✕ (wireframe s7b): the line's amount folds back to the anchor — the
  // total never moves, the cue re-asks for balance. Removing the last
  // split line merges back automatically: one line is not a split.
  function removeLine(index: number) {
    if (lines.length <= 2) {
      onMergeBack()
      return
    }
    onChange(lines.filter((_, i) => i !== index))
    setPickerIndex(null)
  }

  function handleAmountKeys(event: React.KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (status.valid) onSave()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div data-testid="split-editor">
      <div className="mt-5 flex items-center justify-between">
        <span className="label-caps flex items-center gap-1.5">
          Split into {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          {editing && (
            <span className="rounded-full border border-primary px-1.5 py-px text-[10px] text-primary normal-case tracking-normal">
              editing
            </span>
          )}
        </span>
        <Button variant="ghost" size="xs" onClick={onMergeBack}>
          Merge back
        </Button>
      </div>

      <div className="mt-2 rounded-md border">
        {lines.map((line, index) => {
          // Empty is incomplete (not an error); only garbage wears a cue.
          const unparseable =
            line.amountInput.trim() !== '' &&
            parseAmountInput(line.amountInput, txn.currency) === null
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are append-only and replaced wholesale — the index IS the identity
            <div key={index} className={cn(index > 0 && 'border-t')}>
              <div
                data-testid="split-line"
                className="flex items-center gap-2 px-3 py-2"
              >
                {editing ? (
                  <button
                    type="button"
                    aria-label={`Line ${index + 1} category`}
                    aria-expanded={pickerIndex === index}
                    className="min-w-0"
                    onClick={() =>
                      setPickerIndex(pickerIndex === index ? null : index)
                    }
                  >
                    {line.category !== null ? (
                      <CategoryPill category={line.category} />
                    ) : (
                      <span className="inline-flex items-center rounded-[7px] border border-dashed px-2 py-px text-[11.5px] text-muted-foreground">
                        pick category
                      </span>
                    )}
                  </button>
                ) : line.category !== null ? (
                  <CategoryPill category={line.category} />
                ) : (
                  <UncategorizedPill />
                )}
                <ProvenanceBadge provenance={line.provenance} />
                {editing ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <span
                      aria-hidden
                      className={cn(
                        'amount text-[12.5px]',
                        negative ? 'text-destructive' : 'text-success',
                      )}
                    >
                      {sign}
                    </span>
                    <Input
                      value={line.amountInput}
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} amount`}
                      aria-invalid={unparseable || undefined}
                      className={cn(
                        'amount h-7 w-24 px-2 text-right text-[12.5px]',
                        unparseable && 'border-destructive',
                      )}
                      onChange={(event) =>
                        setLine(index, {
                          ...line,
                          amountInput: event.target.value,
                        })
                      }
                      onKeyDown={handleAmountKeys}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Remove line ${index + 1}`}
                      title="Remove line — amount folds back to anchor"
                      onClick={() => removeLine(index)}
                    >
                      ✕
                    </Button>
                  </span>
                ) : (
                  <span
                    className={cn(
                      'amount ml-auto whitespace-nowrap text-[12.5px]',
                      negative ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {sign}
                    {formatMinorUnits(
                      Math.abs(
                        parseAmountInput(line.amountInput, txn.currency) ?? 0,
                      ),
                      txn.currency,
                    )}
                  </span>
                )}
              </div>
              {editing && pickerIndex === index && (
                <div className="border-t px-3 pb-2">
                  <CategoryPicker
                    categories={categories}
                    isPending={categoriesPending}
                    onPick={(picked) => {
                      // A user-picked line category is the user's decision —
                      // provenance none, whatever line 1 inherited.
                      setLine(index, {
                        ...line,
                        category: picked,
                        provenance: 'none',
                      })
                      setPickerIndex(null)
                    }}
                    onClose={() => setPickerIndex(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {editing ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onChange([...lines, emptySplitLine()])}
          >
            + Add line
          </Button>
        ) : (
          <span />
        )}
        {/* The lines-vs-total cue — the same `splitStatus` the Accept gate
         * reads, so the cue and the block can never disagree. Calm on
         * incomplete (still typing), pointed on a genuine mismatch. */}
        <span
          data-testid="split-cue"
          data-valid={status.valid}
          className="text-[11.5px] text-muted-foreground"
        >
          lines{' '}
          <span
            className={cn(
              'amount font-semibold',
              status.complete && !status.valid && 'text-destructive',
            )}
          >
            {formatMinorUnits(status.linesTotalMinor, txn.currency)}
          </span>{' '}
          {status.valid ? (
            <>
              = total{' '}
              <span aria-hidden className="font-semibold text-success">
                ✓
              </span>
              <span className="sr-only">— lines match the total</span>
            </>
          ) : status.complete ? (
            <>
              <span className="font-semibold text-destructive">≠</span> total{' '}
              <span className="amount">
                {formatMinorUnits(txn.amount_minor, txn.currency)}
              </span>
            </>
          ) : (
            <>
              of{' '}
              <span className="amount">
                {formatMinorUnits(txn.amount_minor, txn.currency)}
              </span>{' '}
              — fill every line
            </>
          )}
        </span>
      </div>

      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        {editing
          ? 'editing — amounts are inputs, ✕ removes a line (its amount folds back to the anchor), + Add line adds one; lines must sum to the total, and removing the last split merges back automatically'
          : 'one transaction — categories live on the lines, the anchor keeps its raw data, so nothing double-counts. Edit split changes amounts or adds / removes lines'}
      </p>
    </div>
  )
}
