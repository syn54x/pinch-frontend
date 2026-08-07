import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useMemo, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  createRuleMutation,
  listCategoriesOptions,
  listRulesQueryKey,
  updateRuleMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { previewRule } from '@/api/generated/sdk.gen'
import type {
  RetroApplyTier,
  RuleOut,
  RulePreviewOut,
} from '@/api/generated/types.gen'
import { type ConditionWire, parseAmountMinor } from '@/components/rules/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

// F4 CP2 (#60, wireframes s19/s19b): the rule builder — typed conditions,
// actions, a live preview with the consent counts, and the retro-apply
// tiers at every CREATION consent: authoring a new rule, or accepting a
// promoted one (the proposed->active PATCH carries the tier — acceptance
// is what makes it law, CONTEXT.md: Retro-apply). Editing active law
// reuses the form without the tiers; a plain PATCH never re-offers them.
export function RuleBuilder({ editing }: { editing: RuleOut | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useQuery(listCategoriesOptions({ query: { limit: 100 } }))

  const editingCondition = editing?.condition as ConditionWire | undefined
  const [payeeOp, setPayeeOp] = useState<'contains' | 'equals'>(
    editingCondition?.payee?.op ?? 'contains',
  )
  const [payeeValue, setPayeeValue] = useState(
    editingCondition?.payee?.value ?? '',
  )
  const [amountMin, setAmountMin] = useState(
    editingCondition?.amount?.lo != null
      ? String(editingCondition.amount.lo / 100)
      : '',
  )
  const [amountMax, setAmountMax] = useState(
    editingCondition?.amount?.hi != null
      ? String(editingCondition.amount.hi / 100)
      : '',
  )
  const [direction, setDirection] = useState<'out' | 'in' | 'either'>(
    editingCondition?.amount?.direction ?? 'out',
  )
  const [categoryId, setCategoryId] = useState(
    editing?.action_category?.id ?? '',
  )
  const [tagsRaw, setTagsRaw] = useState(
    editing?.action_add_tags.join(', ') ?? '',
  )
  const [renameTo, setRenameTo] = useState(editing?.action_rename_to ?? '')
  const [tier, setTier] = useState<RetroApplyTier>('unreviewed')
  const [error, setError] = useState<string | null>(null)

  const condition = useMemo<ConditionWire | null>(() => {
    const spec: ConditionWire = {}
    if (payeeValue.trim()) {
      spec.payee = { op: payeeOp, value: payeeValue.trim() }
    }
    const lo = parseAmountMinor(amountMin)
    const hi = parseAmountMinor(amountMax)
    if (lo != null || hi != null) {
      spec.amount = {
        op: 'between',
        ...(lo != null ? { lo } : {}),
        ...(hi != null ? { hi } : {}),
        direction,
      }
    }
    return spec.payee || spec.amount ? spec : null
  }, [payeeOp, payeeValue, amountMin, amountMax, direction])

  // The live preview: evidence, not hope — and the consent counts the
  // tier chooser reads. Keyed on the condition JSON; a bad condition's 400
  // simply blanks the preview.
  const conditionJson = condition ? JSON.stringify(condition) : null
  const preview = useQuery<RulePreviewOut | null>({
    queryKey: ['rule-preview', conditionJson],
    enabled: conditionJson !== null,
    queryFn: async () => {
      const { data } = await previewRule({
        body: JSON.parse(conditionJson as string),
        throwOnError: true,
      })
      return data ?? null
    },
  })

  const counts = preview.data ?? null
  const fullTotal =
    (counts?.unreviewed_count ?? 0) + (counts?.reviewed_count ?? 0)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listRulesQueryKey() })
  const done = () => {
    void invalidate()
    void navigate({ to: '/categories/rules' })
  }
  const create = useMutation({
    ...createRuleMutation(),
    onSuccess: done,
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })
  const update = useMutation({
    ...updateRuleMutation(),
    onSuccess: done,
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!condition) {
      setError('At least one condition is required')
      return
    }
    const actions = {
      action_category_id: categoryId || null,
      action_add_tags: tagsRaw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      action_rename_to: renameTo.trim() || null,
    }
    if (editing) {
      update.mutate({
        path: { rule_id: editing.id },
        body: {
          condition,
          ...actions,
          // Accepting a suggested rule is this same PATCH: consent flips
          // proposed -> active, and — acceptance being the creation
          // consent — it may carry the retro tier (CONTEXT.md: Retro-apply).
          ...(editing.status === 'proposed'
            ? { status: 'active' as const, apply: tier }
            : {}),
        },
      })
    } else {
      create.mutate({ body: { condition, ...actions, apply: tier } })
    }
  }

  const accepting = editing?.status === 'proposed'
  const consentLabel =
    tier === 'forward'
      ? 'Create rule'
      : tier === 'unreviewed'
        ? `Create rule & apply to ${counts?.unreviewed_count ?? 0}`
        : `Create rule & recategorize ${fullTotal}`
  const submitLabel = editing && !accepting ? 'Save changes' : consentLabel

  return (
    <form className="grid max-w-2xl gap-5" onSubmit={submit}>
      <p className="text-muted-foreground text-sm">
        Runs deterministically on incoming transactions — before history & AI.
      </p>
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 font-semibold text-sm">
          When a transaction matches
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-muted-foreground text-sm">Payee</span>
          <select
            aria-label="Payee operator"
            value={payeeOp}
            onChange={(event) =>
              setPayeeOp(event.target.value as 'contains' | 'equals')
            }
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="contains">contains</option>
            <option value="equals">equals</option>
          </select>
          <Input
            aria-label="Payee value"
            value={payeeValue}
            onChange={(event) => setPayeeValue(event.target.value)}
            placeholder="COSTCO"
            className="w-48"
            maxLength={200}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-muted-foreground text-sm">Amount</span>
          <select
            aria-label="Amount direction"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as 'out' | 'in' | 'either')
            }
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="out">money out</option>
            <option value="in">money in</option>
            <option value="either">either way</option>
          </select>
          <Input
            aria-label="Minimum amount"
            value={amountMin}
            onChange={(event) => setAmountMin(event.target.value)}
            placeholder="min $"
            className="w-24"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            aria-label="Maximum amount"
            value={amountMax}
            onChange={(event) => setAmountMax(event.target.value)}
            placeholder="max $"
            className="w-24"
          />
        </div>
      </fieldset>
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 font-semibold text-sm">Then</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="rule-category" className="w-24 text-muted-foreground">
            Set category
          </Label>
          <select
            id="rule-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 min-w-44 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">— none —</option>
            {(categories.data?.items ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ''}
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="rule-tags" className="w-24 text-muted-foreground">
            Add tags
          </Label>
          <Input
            id="rule-tags"
            value={tagsRaw}
            onChange={(event) => setTagsRaw(event.target.value)}
            placeholder="tag, another-tag"
            className="w-64"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="rule-rename" className="w-24 text-muted-foreground">
            Rename to
          </Label>
          <Input
            id="rule-rename"
            value={renameTo}
            onChange={(event) => setRenameTo(event.target.value)}
            placeholder="optional display name"
            className="w-64"
            maxLength={100}
          />
        </div>
      </fieldset>

      {counts && (
        <div
          className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-sm"
          data-testid="rule-preview"
        >
          <p className="font-medium">
            Matches {fullTotal + counts.skipped_count} existing transaction
            {fullTotal + counts.skipped_count === 1 ? '' : 's'}
            <span className="ml-2 font-normal text-muted-foreground text-xs">
              {counts.unreviewed_count} unreviewed · {counts.reviewed_count}{' '}
              already reviewed
              {counts.skipped_count > 0 &&
                ` · ${counts.skipped_count} skipped (splits & transfers keep their structure)`}
            </span>
          </p>
          <ul className="mt-1.5 grid gap-1">
            {preview.data?.items.slice(0, 4).map((txn) => (
              <li
                key={txn.id}
                className="flex justify-between gap-3 text-muted-foreground text-xs"
              >
                <span className="truncate">
                  {txn.display_name ?? txn.description_raw} · {txn.date}
                </span>
                <span className="font-mono">
                  {formatMinorUnits(txn.amount_minor, txn.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(!editing || accepting) && (
        <fieldset className="grid gap-1.5" data-testid="apply-tiers">
          <legend className="mb-1 font-semibold text-sm">
            Apply this rule to
          </legend>
          <TierOption
            checked={tier === 'forward'}
            onSelect={() => setTier('forward')}
            title="Going forward only"
            caption="New transactions as they arrive"
          />
          <TierOption
            checked={tier === 'unreviewed'}
            onSelect={() => setTier('unreviewed')}
            title="…and unreviewed transactions"
            badge="default"
            caption={`Re-proposes ${counts?.unreviewed_count ?? 0} item${
              (counts?.unreviewed_count ?? 0) === 1 ? '' : 's'
            } waiting in To-review — they'll carry this rule's suggestion for your review`}
          />
          <TierOption
            checked={tier === 'full'}
            onSelect={() => setTier('full')}
            title="…and already-reviewed transactions"
            caption={`Overwrites ${counts?.reviewed_count ?? 0} transaction${
              (counts?.reviewed_count ?? 0) === 1 ? '' : 's'
            } you already filed — they stay reviewed, just recategorized`}
          />
          {tier === 'full' && (counts?.reviewed_count ?? 0) > 0 && (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12.5px]"
              data-testid="full-tier-warning"
            >
              This overwrites {counts?.reviewed_count} decision
              {counts?.reviewed_count === 1 ? '' : 's'} you made. They keep
              their reviewed status — nothing returns to your queue. Logged as
              one entry in Learning.
            </p>
          )}
        </fieldset>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: '/categories/rules' })}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function TierOption({
  checked,
  onSelect,
  title,
  caption,
  badge,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  caption: string
  badge?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
        checked ? 'border-ring bg-muted/50' : 'hover:bg-muted/30',
      )}
    >
      <input
        type="radio"
        name="apply-tier"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5"
      />
      <span className="grid gap-0.5">
        <span className="flex items-center gap-2 font-medium text-sm">
          {title}
          {badge && (
            <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{caption}</span>
      </span>
    </label>
  )
}
