import { createFileRoute } from '@tanstack/react-router'

// F4 CP4 (#62) fills this tab: the flywheel made visible, read-only.
export const Route = createFileRoute('/_authed/categories/learning')({
  component: LearningTab,
})

function LearningTab() {
  return (
    <p className="text-muted-foreground text-sm" data-testid="learning-tab">
      Learning lands with CP4.
    </p>
  )
}
