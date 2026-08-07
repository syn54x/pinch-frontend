import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'
import { matchAccounts } from '@/lib/global-search'
import { cn } from '@/lib/utils'

// Global search v1 (F10 CP4, the wireframes' top-bar `.search`): account
// names match client-side; every result lands on the Register — an account
// pick filters to that account (uniform across kinds, no per-kind deep
// links), and "Search transactions" carries the typed text as the
// Register's free-text filter. No search endpoint exists or is called.
//
// Keyboard vocabulary: `/` focuses the field from anywhere in the shell
// (ignored while typing elsewhere); ⌘K stays Penny's and ⌘P stays reserved
// — this component binds neither. A hand-rolled ARIA combobox (no cmdk in
// the house): the input owns focus, aria-activedescendant tracks the
// highlighted option, the listbox is render-only.

type SearchOption =
  | { kind: 'account'; id: string; label: string; mask: string | null }
  | { kind: 'transactions'; q: string }

export function GlobalSearch() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // The whole (first-page) accounts vocabulary, asked for lazily — the
  // field pulls nothing until it's opened. Matching is client-side.
  const accounts = useQuery({
    ...listAccountsOptions({ query: { limit: 100 } }),
    enabled: open,
  })

  const query = draft.trim()
  const accountOptions: SearchOption[] = matchAccounts(
    accounts.data?.items ?? [],
    draft,
  ).map((account) => ({
    kind: 'account',
    id: account.id,
    label: account.label,
    mask: account.mask,
  }))
  // Deep search is always reachable once there's text: accounts first
  // (the specific jump), then the Register's free-text filter as the
  // catch-all last row.
  const options: SearchOption[] =
    query === ''
      ? accountOptions
      : [...accountOptions, { kind: 'transactions', q: query }]
  const active = options[Math.min(activeIndex, options.length - 1)]

  // `/` focuses the field from anywhere — unless the keystroke belongs to
  // another editing surface (the Penny composer, a filter input, …).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      )
        return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function select(option: SearchOption | undefined) {
    if (!option) return
    if (option.kind === 'account') {
      // Land filtered to the account — a fresh find, not a composition
      // with whatever filters the Register held before.
      void navigate({ to: '/register', search: { account: option.id } })
    } else {
      void navigate({ to: '/register', search: { q: option.q } })
    }
    setDraft('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (options.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(
        (index) =>
          (Math.min(index, options.length - 1) + delta + options.length) %
          options.length,
      )
    } else if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      select(active)
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      } else {
        inputRef.current?.blur()
      }
    }
  }

  const activeId = active
    ? `${listboxId}-${options.indexOf(active)}`
    : undefined

  return (
    <div className="relative ml-2 hidden w-full max-w-[300px] sm:block">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Search"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? activeId : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        data-testid="global-search"
        placeholder="Search transactions, accounts…"
        className="h-[30px] w-full rounded-md border bg-card pr-8 pl-8 text-[11.5px] text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => {
          setActiveIndex(0)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onInputKeyDown}
      />
      <kbd
        aria-hidden
        className={cn(
          'absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-px font-mono font-semibold text-[10px] text-muted-foreground',
          open && 'hidden',
        )}
      >
        /
      </kbd>
      <div
        role="listbox"
        id={listboxId}
        aria-label="Search results"
        data-testid="global-search-results"
        // Keep focus in the input across option clicks — blur would close
        // the list before the click lands.
        onMouseDown={(event) => event.preventDefault()}
        className={cn(
          'absolute top-full right-0 left-0 z-50 mt-1.5 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md',
          open && options.length > 0 ? 'block' : 'hidden',
        )}
      >
        {options.map((option, index) => {
          const isActive = option === active
          return (
            <button
              key={option.kind === 'account' ? option.id : '(transactions)'}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={isActive}
              tabIndex={-1}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]',
                isActive && 'bg-muted',
              )}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => select(option)}
            >
              {option.kind === 'account' ? (
                <span className="min-w-0 flex-1 truncate">
                  {option.label}
                  {option.mask && (
                    <span className="ml-1.5 text-muted-foreground">
                      ···{option.mask}
                    </span>
                  )}
                </span>
              ) : (
                <>
                  <Search
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    Search transactions for “{option.q}”
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
