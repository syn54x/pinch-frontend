import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { listCategoriesOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { CategoryColor, CategoryRef } from '@/api/generated/types.gen'
import { categoryColorVar as slotColorVar } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import { categoryColorVar, categoryEmoji } from './model'

// The catpill (DESIGN.md's category pill): emoji + name on a tint of the
// category color — 15% in light, 28% with text mixed toward white in dark
// (wireframe .catpill + .fr.dark .catpill). Identity is user-chosen since
// F4 CP1 (#59): the stored emoji/color slot wins, resolved from the
// categories list cache (the wire CategoryRef is id+name only); the
// name-derived fallback in model.ts remains the unset-identity rendering.
//
// Register-local by ruling: the review kit builds its own; dedup happens on the
// integration branch.
export function CatPill({
  category,
  identityOverride,
  className,
}: {
  category: CategoryRef
  /** Bypass the cache lookup — the category dialog's live preview. */
  identityOverride?: { emoji: string | null; color: CategoryColor | null }
  className?: string
}) {
  const { data: stored } = useQuery({
    ...listCategoriesOptions({ query: { limit: 100 } }),
    enabled: identityOverride === undefined,
    select: (page) => page.items.find((row) => row.id === category.id),
  })
  const identity = identityOverride ?? stored
  const color = identity?.color
    ? slotColorVar(identity.color)
    : categoryColorVar(category.name)
  const emoji = identity?.emoji ?? categoryEmoji(category.name)
  return (
    <span
      data-testid="catpill"
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[7px] px-2 py-px font-semibold text-[11.5px]',
        'bg-[color-mix(in_oklch,var(--c)_15%,transparent)] text-(--c)',
        'dark:bg-[color-mix(in_oklch,var(--c)_28%,transparent)] dark:text-[color-mix(in_oklch,var(--c)_72%,white)] dark:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--c)_45%,transparent)]',
        className,
      )}
      style={{ '--c': color } as CSSProperties}
    >
      <span aria-hidden>{emoji}</span>
      <span className="truncate">{category.name}</span>
    </span>
  )
}
