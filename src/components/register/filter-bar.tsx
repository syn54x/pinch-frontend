import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  listAccountsOptions,
  listCategoriesOptions,
  listTagsOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import { Input } from '@/components/ui/input'
import { FilterChip } from './filter-chip'
import {
  dateChipLabel,
  datePresets,
  hasActiveFilters,
  type RegisterSearch,
  UNCATEGORIZED,
} from './model'

// Wireframe #8's find row: search flex-1, then the four filter chips —
// account × category × date range × tag. Every control writes URL search
// state; the parent owns navigation. (The wireframe's Export / + Add live
// in later CPs — nothing disabled ships.)
export function FilterBar({
  search,
  onPatch,
}: {
  search: RegisterSearch
  onPatch: (patch: Partial<RegisterSearch>) => void
}) {
  // Filter vocabularies. First pages only (limit 100) — a ledger with more
  // accounts/categories/tags than that outgrows chips, not this CP.
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const categories = useQuery(listCategoriesOptions({ query: { limit: 100 } }))
  const tags = useQuery(listTagsOptions({ query: { limit: 100 } }))

  const accountLabel = accounts.data?.items.find(
    (a) => a.id === search.account,
  )?.label
  const categoryLabel =
    search.category === UNCATEGORIZED
      ? 'Uncategorized'
      : categories.data?.items.find((c) => c.id === search.category)?.name
  const presets = datePresets()

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <SearchInput
        value={search.q ?? ''}
        onCommit={(q) => onPatch({ q: q || undefined })}
      />
      <FilterChip
        name="Account"
        label={accountLabel ?? 'All accounts'}
        active={Boolean(search.account)}
        selected={search.account}
        onSelect={(account) => onPatch({ account })}
        options={[
          { value: undefined, label: 'All accounts' },
          ...(accounts.data?.items ?? []).map((a) => ({
            value: a.id,
            label: a.mask ? `${a.label} ···${a.mask}` : a.label,
          })),
        ]}
      />
      <FilterChip
        name="Category"
        label={categoryLabel ?? 'Category'}
        active={Boolean(search.category)}
        selected={search.category}
        onSelect={(category) => onPatch({ category })}
        options={[
          { value: undefined, label: 'All categories' },
          { value: UNCATEGORIZED, label: 'Uncategorized' },
          ...(categories.data?.items ?? []).map((c) => ({
            value: c.id,
            label: c.name,
          })),
        ]}
      />
      <FilterChip
        name="Date"
        label={dateChipLabel(search)}
        active={Boolean(search.from || search.to)}
        selected={
          presets.find((p) => p.from === search.from && p.to === search.to)?.id
        }
        onSelect={(id) => {
          const preset = presets.find((p) => p.id === id)
          onPatch({ from: preset?.from, to: preset?.to })
        }}
        options={presets.map((p) => ({
          value: p.id === 'all' ? undefined : p.id,
          label: p.label,
        }))}
      />
      <FilterChip
        name="Tag"
        label={search.tag ? `#${search.tag}` : 'Tag'}
        active={Boolean(search.tag)}
        selected={search.tag}
        onSelect={(tag) => onPatch({ tag })}
        options={[
          { value: undefined, label: 'All tags' },
          ...(tags.data?.items ?? []).map((t) => ({
            value: t.name,
            label: `#${t.name}`,
          })),
        ]}
      />
      {hasActiveFilters(search) && (
        <button
          type="button"
          className="h-7 shrink-0 rounded-full px-2.5 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() =>
            onPatch({
              q: undefined,
              account: undefined,
              category: undefined,
              tag: undefined,
              from: undefined,
              to: undefined,
            })
          }
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// Debounced search box. The committed value lives in the URL; the draft
// lives here. External resets (Clear filters) flow back down.
function SearchInput({
  value,
  onCommit,
}: {
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    if (draft === committed.current) return
    const timer = setTimeout(() => {
      committed.current = draft
      onCommit(draft)
    }, 300)
    return () => clearTimeout(timer)
  }, [draft, onCommit])

  return (
    <Input
      type="search"
      aria-label="Search transactions"
      // The API's honest reach (q searches text, not amounts).
      placeholder="Search payee, description, note…"
      className="h-7 min-w-40 flex-1 basis-48 rounded-lg text-[12.5px]"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  )
}
