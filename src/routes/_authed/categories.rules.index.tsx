import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  deleteRuleMutation,
  listRulesOptions,
  listRulesQueryKey,
  updateRuleMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { RuleOut } from '@/api/generated/types.gen'
import { CatPill } from '@/components/register/catpill'
import { type ConditionWire, conditionSentence } from '@/components/rules/model'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// F4 CP2 (#60, wireframe s17b): the law made visible — every rule with its
// sentence, origin, and earned keep; Penny's suggested rules on top,
// finally reaching consent.
export const Route = createFileRoute('/_authed/categories/rules/')({
  component: RulesTab,
})

function RulesTab() {
  const queryClient = useQueryClient()
  const rules = useQuery(listRulesOptions({ query: { limit: 100 } }))
  const [error, setError] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listRulesQueryKey() })
  const patch = useMutation({
    ...updateRuleMutation(),
    onSuccess: () => void invalidate(),
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })
  const remove = useMutation({
    ...deleteRuleMutation(),
    onSuccess: () => void invalidate(),
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  const items = rules.data?.items ?? []
  const suggested = items.filter((rule) => rule.status === 'proposed')
  const law = items.filter(
    (rule) => rule.status === 'active' || rule.status === 'disabled',
  )

  if (rules.isPending) {
    return <Skeleton className="h-48 w-full" data-testid="rules-tab" />
  }
  return (
    <div className="max-w-2xl" data-testid="rules-tab">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Rules</h2>
        <Button size="sm" asChild>
          <Link to="/categories/rules/new">
            <Plus className="size-3.5" aria-hidden /> New rule
          </Link>
        </Button>
      </div>
      {error && <p className="mb-2 text-destructive text-sm">{error}</p>}

      {suggested.map((rule) => (
        <div
          key={rule.id}
          data-testid="suggested-rule"
          className="mb-3 rounded-xl border border-penny/40 bg-card p-3.5"
        >
          <p className="font-semibold text-[12.5px] text-penny">
            Penny suggests a rule
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Your own filings keep landing here — promoted from history, waiting
            on your consent.
          </p>
          <p className="mt-2 text-sm">
            <RuleSentence rule={rule} />
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" asChild>
              <Link to="/categories/rules/$ruleId" params={{ ruleId: rule.id }}>
                Create rule
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                patch.mutate({
                  path: { rule_id: rule.id },
                  body: { status: 'dismissed' },
                })
              }
            >
              Dismiss
            </Button>
          </div>
        </div>
      ))}

      <ul className="divide-y rounded-xl border bg-card">
        {law.map((rule) => (
          <li
            key={rule.id}
            data-testid="rule-row"
            className="flex items-center gap-3 px-3.5 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate">
                <RuleSentence rule={rule} />
              </p>
              <p className="text-muted-foreground text-xs">
                matched {rule.matched_count} ·{' '}
                {rule.origin === 'promotion'
                  ? 'promoted from history'
                  : 'created by you'}
                {rule.status === 'disabled' && ' · disabled'}
              </p>
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" asChild>
                <Link
                  to="/categories/rules/$ruleId"
                  params={{ ruleId: rule.id }}
                >
                  Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  patch.mutate({
                    path: { rule_id: rule.id },
                    body: {
                      status: rule.status === 'active' ? 'disabled' : 'active',
                    },
                  })
                }
              >
                {rule.status === 'active' ? 'Disable' : 'Enable'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove.mutate({ path: { rule_id: rule.id } })}
              >
                Delete
              </Button>
            </span>
          </li>
        ))}
        {law.length === 0 && suggested.length === 0 && (
          <li className="px-3.5 py-6 text-center text-muted-foreground text-sm">
            No rules yet — file consistently and Penny will suggest them, or
            author one directly.
          </li>
        )}
      </ul>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        rules beat history & AI · a rule is only ever created with your consent
      </p>
    </div>
  )
}

function RuleSentence({ rule }: { rule: RuleOut }) {
  return (
    <>
      {conditionSentence(rule.condition as ConditionWire)}
      <span aria-hidden> → </span>
      {rule.action_category ? (
        <CatPill category={rule.action_category} />
      ) : rule.action_mark_transfer ? (
        'mark as transfer'
      ) : null}
      {rule.action_add_tags.length > 0 &&
        ` +${rule.action_add_tags.map((tag) => `#${tag}`).join(' ')}`}
      {rule.action_rename_to && ` rename "${rule.action_rename_to}"`}
    </>
  )
}
