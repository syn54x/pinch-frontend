// F4 CP0 (#58): the ONE place slot names resolve to color (CONTEXT.md:
// Category identity, pinch-backend). The backend stores names from an
// append-only enum; a name binds to "a color that reads as that name" — a
// palette re-tune edits this file and moves zero stored data. Order matches
// the hue wheel (24° steps at the band's fixed lightness/chroma), so
// swatch rows read as a spectrum.
import type { CategoryColor } from '@/api/generated/types.gen'

export const CATEGORY_COLOR_SLOTS = [
  'rust',
  'amber',
  'gold',
  'olive',
  'green',
  'sage',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'magenta',
  'rose',
  'slate',
] as const satisfies readonly CategoryColor[]

const SLOT_VARS: Record<CategoryColor, string> = Object.fromEntries(
  CATEGORY_COLOR_SLOTS.map((slot, index) => [
    slot,
    slot === 'slate' ? 'var(--cat-slate)' : `var(--cat-${index + 1})`,
  ]),
) as Record<CategoryColor, string>

/** CSS color for a slot name; null (unset identity) gets the neutral ink
 * categories render with today. */
export function categoryColorVar(
  slot: CategoryColor | null | undefined,
): string {
  return slot ? SLOT_VARS[slot] : 'var(--muted-foreground)'
}
