import { createFileRoute } from '@tanstack/react-router'

// F4 CP3 (#61) fills this tab: tags with totals, rename, export.
export const Route = createFileRoute('/_authed/categories/tags')({
  component: TagsTab,
})

function TagsTab() {
  return (
    <p className="text-muted-foreground text-sm" data-testid="tags-tab">
      Tags land with CP3.
    </p>
  )
}
