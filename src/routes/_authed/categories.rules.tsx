import { createFileRoute } from '@tanstack/react-router'

// F4 CP2 (#60) fills this tab: the law, plus Penny's suggested rules.
export const Route = createFileRoute('/_authed/categories/rules')({
  component: RulesTab,
})

function RulesTab() {
  return (
    <p className="text-muted-foreground text-sm" data-testid="rules-tab">
      Rules land with CP2.
    </p>
  )
}
