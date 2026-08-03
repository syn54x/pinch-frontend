import { createFileRoute } from '@tanstack/react-router'
import { RuleBuilder } from '@/components/rules/rule-builder'

// F4 CP2 (#60, wireframe s19): authoring — the only place the retro-apply
// tiers are offered (creation-time consent).
export const Route = createFileRoute('/_authed/categories/rules/new')({
  component: NewRule,
})

function NewRule() {
  return (
    <div>
      <h2 className="mb-3 font-semibold text-sm">New rule</h2>
      <RuleBuilder editing={null} />
    </div>
  )
}
