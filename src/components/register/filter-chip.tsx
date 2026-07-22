import { Check, ChevronDown } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

// The wireframe's filter chip (.chip / .chip.on): a bordered pill that opens
// a single-select menu; a chip holding a value goes accent. Built on radix
// Popover for focus/dismiss behavior. Register-local by ruling (the Inbox
// agent builds its own chips; dedup happens on the integration branch).

export type ChipOption = {
  value: string | undefined
  label: string
  /** Optional richer row rendering; label still names it for a11y. */
  render?: ReactNode
}

export function FilterChip({
  name,
  label,
  active,
  options,
  selected,
  onSelect,
}: {
  /** Accessible name for the whole filter, e.g. "Account". */
  name: string
  /** What the chip reads right now, e.g. "All accounts" or a value. */
  label: string
  /** Whether a value is held (accent style). */
  active: boolean
  options: ChipOption[]
  selected: string | undefined
  onSelect: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label={`${name}: ${label}`}
        data-testid={`chip-${name.toLowerCase().replace(/\s+/g, '-')}`}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          active
            ? 'border-transparent bg-primary font-medium text-primary-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown aria-hidden className="size-3 opacity-70" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-80 min-w-44 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:fade-in-0 data-[state=open]:animate-in"
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">
              Nothing to filter by yet
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.value ?? '(all)'}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => {
                  onSelect(option.value)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {option.render ?? option.label}
                </span>
                {option.value === selected && (
                  <Check aria-hidden className="size-3.5 shrink-0" />
                )}
              </button>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
