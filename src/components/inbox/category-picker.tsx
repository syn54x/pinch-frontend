import { useId, useState } from 'react'
import type { CategoryOut, CategoryRef } from '@/api/generated/types.gen'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CategoryPill } from './category-pill'

// The category-correction affordance (opened by C): a filter input over the
// ledger's categories, fully keyboard-drivable — type to narrow, ↑/↓ to
// move, Enter to pick, Escape to close. Picking stages the correction; the
// review call happens on Accept (one-shot, #18).
//
// #63 (wireframe s7c 2b): when the typed query matches no category name
// exactly, a "＋ Create" row joins the list — always LAST ("existing
// categories win the ranking so people don't grow a junk drawer by
// accident"), reachable by arrows or ⌘↩ from anywhere in the input. The
// first remaining match wears a "closest match" hint.

export function CategoryPicker({
  categories,
  isPending,
  onPick,
  onClose,
  onCreate,
}: {
  categories: CategoryOut[]
  isPending: boolean
  onPick: (category: CategoryRef) => void
  onClose: () => void
  /** Opens the inline create sheet with the typed name (#63). */
  onCreate?: (name: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const needle = filter.trim().toLowerCase()
  const matches = categories.filter((category) =>
    category.name.toLowerCase().includes(needle),
  )
  const creatable =
    onCreate !== undefined &&
    needle !== '' &&
    !categories.some(
      (category) => category.name.trim().toLowerCase() === needle,
    )
  // The create row occupies the index AFTER the last match.
  const optionCount = matches.length + (creatable ? 1 : 0)
  const activeIndex = Math.min(active, Math.max(optionCount - 1, 0))

  function create() {
    if (creatable) onCreate?.(filter.trim())
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, optionCount - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      // ⌘↩ jumps straight to create, wherever the highlight sits.
      event.preventDefault()
      create()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = matches[activeIndex]
      if (picked !== undefined) onPick({ id: picked.id, name: picked.name })
      else if (creatable && activeIndex === matches.length) create()
    }
  }

  return (
    <div data-testid="category-picker" className="mt-2 rounded-md border">
      <Input
        // C hands the keyboard straight to the filter — that is the feature.
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-label="Correct category"
        placeholder="Filter categories…"
        className="rounded-b-none border-0 border-b focus-visible:ring-0"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value)
          setActive(0)
        }}
        onKeyDown={handleKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Categories"
        className="max-h-44 overflow-y-auto py-1"
      >
        {isPending ? (
          <div className="space-y-1 px-2 py-1">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : matches.length === 0 && !creatable ? (
          <p className="px-3 py-2 text-[11.5px] text-muted-foreground">
            {categories.length === 0
              ? 'No categories yet.'
              : 'No categories match.'}
          </p>
        ) : (
          <>
            {matches.map((category, index) => (
              <button
                key={category.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1 text-left',
                  index === activeIndex && 'bg-accent',
                )}
                onPointerMove={() => setActive(index)}
                onClick={() => onPick({ id: category.id, name: category.name })}
              >
                <CategoryPill category={category} />
                {creatable && index === 0 && (
                  <span className="text-[10.5px] text-muted-foreground">
                    closest match
                  </span>
                )}
              </button>
            ))}
            {creatable && (
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === matches.length}
                tabIndex={-1}
                data-testid="create-category-row"
                className={cn(
                  'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px]',
                  activeIndex === matches.length && 'bg-accent',
                )}
                onPointerMove={() => setActive(matches.length)}
                onClick={create}
              >
                <span>＋ Create “{filter.trim()}”</span>
                <kbd className="rounded border px-1 py-px font-mono text-[10px] text-muted-foreground">
                  ⌘↩
                </kbd>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
