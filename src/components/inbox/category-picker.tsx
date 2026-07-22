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

export function CategoryPicker({
  categories,
  isPending,
  onPick,
  onClose,
}: {
  categories: CategoryOut[]
  isPending: boolean
  onPick: (category: CategoryRef) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const needle = filter.trim().toLowerCase()
  const matches = categories.filter((category) =>
    category.name.toLowerCase().includes(needle),
  )
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0))

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = matches[activeIndex]
      if (picked !== undefined) onPick({ id: picked.id, name: picked.name })
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
        ) : matches.length === 0 ? (
          <p className="px-3 py-2 text-[11.5px] text-muted-foreground">
            {categories.length === 0
              ? 'No categories yet.'
              : 'No categories match.'}
          </p>
        ) : (
          matches.map((category, index) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              className={cn(
                'flex w-full items-center px-2 py-1 text-left',
                index === activeIndex && 'bg-accent',
              )}
              onPointerMove={() => setActive(index)}
              onClick={() => onPick({ id: category.id, name: category.name })}
            >
              <CategoryPill category={category} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
