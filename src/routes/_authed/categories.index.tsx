import { createFileRoute } from '@tanstack/react-router'

// F4 CP1 (#59) fills this tab: the category tree with identity and spend.
export const Route = createFileRoute('/_authed/categories/')({
  component: CategoriesTab,
})

function CategoriesTab() {
  return (
    <p className="text-muted-foreground text-sm" data-testid="categories-tab">
      The category tree lands with CP1.
    </p>
  )
}
