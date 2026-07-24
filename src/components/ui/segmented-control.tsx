import { cn } from '@/lib/utils'

// The segmented toggle shared by Net Worth's range picker, Recurring's paid
// filter, and the curation drawer's type switch: a muted track with the active
// segment lifted onto the card surface.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  'aria-label': string
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        'flex items-center gap-0.5 rounded-lg bg-muted p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}
