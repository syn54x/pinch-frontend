import type { CategoryRef } from '@/api/generated/types.gen'
import { cn } from '@/lib/utils'

// The catpill (DESIGN.md): the category's name on a tint of its color.
// Until F4's taxonomy lets users pick color + emoji, the hue is derived
// deterministically from the category id, so the same category wears the
// same muted --cat-* hue on every surface. Static class strings — Tailwind
// only generates classes it can see.

// Light-mode ink is the token deepened 20% toward black — AA (≥5:1,
// canvas-measured) on the /15 tint and on selected-row surfaces, where the
// raw token only manages ~4.2. Dark tokens pass raw on their /25 tints.
const CAT_TINTS = [
  'bg-cat-1/15 text-[color-mix(in_oklch,var(--cat-1)_80%,black)] dark:bg-cat-1/25 dark:text-cat-1',
  'bg-cat-2/15 text-[color-mix(in_oklch,var(--cat-2)_80%,black)] dark:bg-cat-2/25 dark:text-cat-2',
  'bg-cat-3/15 text-[color-mix(in_oklch,var(--cat-3)_80%,black)] dark:bg-cat-3/25 dark:text-cat-3',
  'bg-cat-4/15 text-[color-mix(in_oklch,var(--cat-4)_80%,black)] dark:bg-cat-4/25 dark:text-cat-4',
  'bg-cat-5/15 text-[color-mix(in_oklch,var(--cat-5)_80%,black)] dark:bg-cat-5/25 dark:text-cat-5',
  'bg-cat-6/15 text-[color-mix(in_oklch,var(--cat-6)_80%,black)] dark:bg-cat-6/25 dark:text-cat-6',
  'bg-cat-7/15 text-[color-mix(in_oklch,var(--cat-7)_80%,black)] dark:bg-cat-7/25 dark:text-cat-7',
  'bg-cat-8/15 text-[color-mix(in_oklch,var(--cat-8)_80%,black)] dark:bg-cat-8/25 dark:text-cat-8',
  'bg-cat-9/15 text-[color-mix(in_oklch,var(--cat-9)_80%,black)] dark:bg-cat-9/25 dark:text-cat-9',
  'bg-cat-10/15 text-[color-mix(in_oklch,var(--cat-10)_80%,black)] dark:bg-cat-10/25 dark:text-cat-10',
] as const

function tintFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return CAT_TINTS[Math.abs(hash) % CAT_TINTS.length]
}

export function CategoryPill({
  category,
  className,
}: {
  category: CategoryRef
  className?: string
}) {
  return (
    <span
      data-testid="category-pill"
      className={cn(
        'inline-flex min-w-0 items-center rounded-[7px] px-2 py-px font-semibold text-[11.5px] leading-normal',
        tintFor(category.id),
        className,
      )}
    >
      <span className="truncate">{category.name}</span>
    </span>
  )
}

/** The un-category, worn as a legitimate state: the same muted voice as the
 * `—` provenance badge, never error styling (parent #15). */
export function UncategorizedPill({ className }: { className?: string }) {
  return (
    <span
      data-testid="uncategorized-pill"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-muted px-1.5 py-px font-mono font-semibold text-[10px] text-[color-mix(in_oklch,var(--muted-foreground)_80%,black)] uppercase tracking-[0.03em] dark:text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      uncategorized
    </span>
  )
}
