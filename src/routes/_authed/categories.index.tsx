import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { type CSSProperties, useMemo, useState } from 'react'
import {
  listCategoriesOptions,
  spendingReportOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { CategoryOut } from '@/api/generated/types.gen'
import { CategoryDialog } from '@/components/categories/category-dialog'
import { DeleteCategoryDialog } from '@/components/categories/delete-category-dialog'
import {
  categoryEmoji,
  categoryColorVar as modelColorVar,
} from '@/components/register/model'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { categoryColorVar } from '@/lib/category-colors'
import { formatMinorUnits } from '@/lib/money'

// F4 CP1 (#59, wireframe s17): the category tree with identity and this
// month's rolled-up spend. Identity carries from here into every catpill.
export const Route = createFileRoute('/_authed/categories/')({
  component: CategoriesTab,
})

function CategoriesTab() {
  const categories = useQuery(listCategoriesOptions({ query: { limit: 100 } }))
  const spending = useQuery(spendingReportOptions())
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; category: CategoryOut } | null
  >(null)
  const [deleting, setDeleting] = useState<CategoryOut | null>(null)

  const rows = categories.data?.items ?? []
  const tree = useMemo(() => {
    const children = new Map<string, CategoryOut[]>()
    for (const row of rows) {
      if (row.parent_id) {
        children.set(row.parent_id, [
          ...(children.get(row.parent_id) ?? []),
          row,
        ])
      }
    }
    return rows
      .filter((row) => row.parent_id === null)
      .map((parent) => ({
        parent,
        children: (children.get(parent.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }))
  }, [rows])

  const spend = useMemo(() => {
    const byId = new Map<string | null, number>()
    for (const row of spending.data?.by_category ?? []) {
      byId.set(row.category_id, row.rolled_up_minor)
    }
    return byId
  }, [spending.data])
  const uncategorized = spend.get(null) ?? 0
  const currency = spending.data?.currency ?? 'USD'

  if (categories.isPending) {
    return <Skeleton className="h-48 w-full" data-testid="categories-tab" />
  }
  return (
    <div className="max-w-xl" data-testid="categories-tab">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Category tree</h2>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="size-3.5" aria-hidden /> New
        </Button>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {tree.map(({ parent, children }) => (
          <li key={parent.id}>
            <CategoryRow
              category={parent}
              amountMinor={spend.get(parent.id) ?? 0}
              currency={currency}
              onEdit={() => setDialog({ mode: 'edit', category: parent })}
              onDelete={() => setDeleting(parent)}
            />
            {children.map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                amountMinor={spend.get(child.id) ?? 0}
                currency={currency}
                nested
                onEdit={() => setDialog({ mode: 'edit', category: child })}
                onDelete={() => setDeleting(child)}
              />
            ))}
          </li>
        ))}
        {uncategorized !== 0 && (
          <li className="flex items-center justify-between px-3.5 py-2.5 text-muted-foreground text-sm">
            <span>Uncategorized</span>
            <span className="font-mono">
              {formatMinorUnits(uncategorized, currency)}
            </span>
          </li>
        )}
        {tree.length === 0 && (
          <li className="px-3.5 py-6 text-center text-muted-foreground text-sm">
            No categories yet — create the first one.
          </li>
        )}
      </ul>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        pick a color & emoji per category — they carry through charts, rows &
        the register
      </p>
      {dialog && (
        <CategoryDialog
          // Remount per subject so field state never leaks between edits.
          key={dialog.mode === 'edit' ? dialog.category.id : 'create'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          editing={dialog.mode === 'edit' ? dialog.category : null}
          parents={tree.map(({ parent }) => parent)}
        />
      )}
      <DeleteCategoryDialog
        category={deleting}
        candidates={rows}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}

function CategoryRow({
  category,
  amountMinor,
  currency,
  nested = false,
  onEdit,
  onDelete,
}: {
  category: CategoryOut
  amountMinor: number
  currency: string
  nested?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const color = category.color
    ? categoryColorVar(category.color)
    : modelColorVar(category.name)
  return (
    <div
      data-testid="category-row"
      className="group flex items-center gap-2.5 px-3.5 py-2.5 text-sm"
      style={
        {
          '--c': color,
          paddingLeft: nested ? '2.25rem' : undefined,
        } as CSSProperties
      }
    >
      <span aria-hidden className="w-5 text-center">
        {category.emoji ?? categoryEmoji(category.name)}
      </span>
      <span className="font-medium text-(--c)">{category.name}</span>
      <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Edit ${category.name}`}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${category.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </span>
      <span className="w-20 text-right font-mono text-[13px]">
        {formatMinorUnits(Math.abs(amountMinor), currency)}
      </span>
    </div>
  )
}
