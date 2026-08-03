import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRuleOptions } from '@/api/generated/@tanstack/react-query.gen'
import { RuleBuilder } from '@/components/rules/rule-builder'

// F4 CP2 (#60): edit an existing rule — or accept a suggested one with
// refinement (the card deep-links here; saving flips proposed -> active).
// No retro tiers: creation-time only.
export const Route = createFileRoute('/_authed/categories/rules/$ruleId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      getRuleOptions({ path: { rule_id: params.ruleId } }),
    ),
  component: EditRule,
})

function EditRule() {
  const { ruleId } = Route.useParams()
  const { data: rule } = useSuspenseQuery(
    getRuleOptions({ path: { rule_id: ruleId } }),
  )
  return (
    <div>
      <h2 className="mb-3 font-semibold text-sm">
        {rule.status === 'proposed' ? 'Create rule' : 'Edit rule'}
      </h2>
      <RuleBuilder key={rule.id} editing={rule} />
    </div>
  )
}
