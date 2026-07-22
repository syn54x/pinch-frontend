import type { CSSProperties } from 'react'
import type { CategoryRef } from '@/api/generated/types.gen'
import { cn } from '@/lib/utils'
import { categoryColorVar, categoryEmoji } from './model'

// The catpill (DESIGN.md's category pill): emoji + name on a tint of the
// category color — 15% in light, 28% with text mixed toward white in dark
// (wireframe .catpill + .fr.dark .catpill). Color/emoji are derived until F4
// makes them user-chosen (see model.ts).
//
// Register-local by ruling: the Inbox builds its own; dedup happens on the
// integration branch.
export function CatPill({
  category,
  className,
}: {
  category: CategoryRef
  className?: string
}) {
  return (
    <span
      data-testid="catpill"
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[7px] px-2 py-px font-semibold text-[11.5px]',
        'bg-[color-mix(in_oklch,var(--c)_15%,transparent)] text-(--c)',
        'dark:bg-[color-mix(in_oklch,var(--c)_28%,transparent)] dark:text-[color-mix(in_oklch,var(--c)_72%,white)] dark:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--c)_45%,transparent)]',
        className,
      )}
      style={{ '--c': categoryColorVar(category.name) } as CSSProperties}
    >
      <span aria-hidden>{categoryEmoji(category.name)}</span>
      <span className="truncate">{category.name}</span>
    </span>
  )
}
