import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  createTagMutation,
  deleteTagMutation,
  listTagsOptions,
  listTagsQueryKey,
  listTransactionsOptions,
  meOptions,
  renameTagMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { TagOut } from '@/api/generated/types.gen'
import { CatPill } from '@/components/register/catpill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadFile, toCsv } from '@/lib/csv'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

// F4 CP3 (#61, wireframe s20): every tag with its totals, a detail pane
// down to the rows, rename-everywhere, safe delete, and one-click CSV for
// the expense-report ritual. Tags are orthogonal to categories.
export const Route = createFileRoute('/_authed/categories/tags')({
  component: TagsTab,
})

function TagsTab() {
  const queryClient = useQueryClient()
  const tags = useQuery(listTagsOptions({ query: { limit: 100 } }))
  const me = useQuery(meOptions())
  const currency = me.data?.primary_currency ?? 'USD'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listTagsQueryKey() })
  const create = useMutation({
    ...createTagMutation(),
    onSuccess: () => {
      setDraft('')
      setError(null)
      void invalidate()
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  function submitNew(event: FormEvent) {
    event.preventDefault()
    create.mutate({ body: { name: draft } })
  }

  const items = tags.data?.items ?? []
  const selected = items.find((tag) => tag.id === selectedId) ?? null

  if (tags.isPending) {
    return <Skeleton className="h-48 w-full" data-testid="tags-tab" />
  }
  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]"
      data-testid="tags-tab"
    >
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">All tags</h2>
          <form className="flex gap-1.5" onSubmit={submitNew}>
            <Input
              aria-label="New tag name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="new-tag"
              className="h-8 w-36"
              maxLength={100}
            />
            <Button size="sm" type="submit" disabled={create.isPending}>
              <Plus className="size-3.5" aria-hidden /> New tag
            </Button>
          </form>
        </div>
        {error && <p className="mb-2 text-destructive text-sm">{error}</p>}
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                data-testid="tag-row"
                onClick={() => setSelectedId(tag.id)}
                aria-pressed={selectedId === tag.id}
                className={cn(
                  'flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/50',
                  selectedId === tag.id && 'bg-muted/60',
                )}
              >
                <span className="font-medium">#{tag.name}</span>
                {tag.pending_minor !== 0 && (
                  <span className="rounded bg-muted px-1.5 py-px text-[10.5px] text-muted-foreground">
                    {formatMinorUnits(Math.abs(tag.pending_minor), currency)}{' '}
                    pending
                  </span>
                )}
                <span className="ml-auto text-muted-foreground text-xs">
                  {tag.transaction_count} txns
                </span>
                <span className="w-20 text-right font-mono text-[13px]">
                  {formatMinorUnits(Math.abs(tag.net_minor), currency)}
                </span>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3.5 py-6 text-center text-muted-foreground text-sm">
              No tags yet — they also appear when you tag a transaction.
            </li>
          )}
        </ul>
        <p className="mt-2.5 text-[11.5px] text-muted-foreground">
          tags are orthogonal to categories — filterable in Register, usable in
          rules
        </p>
      </section>
      {selected && (
        <TagDetail
          key={selected.id}
          tag={selected}
          currency={currency}
          onGone={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function TagDetail({
  tag,
  currency,
  onGone,
}: {
  tag: TagOut
  currency: string
  onGone: () => void
}) {
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(tag.name)
  const [error, setError] = useState<string | null>(null)
  const transactions = useQuery(
    listTransactionsOptions({ query: { tag: [tag.name], limit: 100 } }),
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listTagsQueryKey() })
  const rename = useMutation({
    ...renameTagMutation(),
    onSuccess: () => {
      setRenaming(false)
      setError(null)
      void invalidate()
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })
  const remove = useMutation({
    ...deleteTagMutation(),
    onSuccess: () => {
      void invalidate()
      onGone()
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  const rows = transactions.data?.items ?? []
  function exportCsv() {
    downloadFile(
      `${tag.name}.csv`,
      toCsv(
        ['date', 'description', 'category', 'amount', 'currency', 'pending'],
        rows.map((txn) => [
          txn.date,
          txn.display_name ?? txn.description_raw,
          txn.category?.name ?? '',
          formatMinorUnits(txn.amount_minor, txn.currency),
          txn.currency,
          txn.pending ? 'pending' : '',
        ]),
      ),
    )
  }

  return (
    <section
      className="h-fit rounded-xl border bg-card p-4"
      data-testid="tag-detail"
    >
      <div className="mb-1 flex items-center gap-2">
        {renaming ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              rename.mutate({ path: { tag_id: tag.id }, body: { name } })
            }}
          >
            <Input
              aria-label="Tag name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-8 w-44"
              maxLength={100}
              // biome-ignore lint/a11y/noAutofocus: entering rename mode is the focus request
              autoFocus
            />
            <Button size="sm" type="submit" disabled={rename.isPending}>
              Save
            </Button>
          </form>
        ) : (
          <h3 className="font-semibold text-sm">#{tag.name}</h3>
        )}
        <span className="ml-auto text-muted-foreground text-xs">
          {tag.transaction_count} transactions ·{' '}
          {formatMinorUnits(Math.abs(tag.net_minor), currency)}
        </span>
      </div>
      {error && (
        <p className="mb-2 text-destructive text-sm" data-testid="tag-error">
          {error}
        </p>
      )}
      <ul className="divide-y">
        {rows.map((txn) => (
          <li
            key={txn.id}
            className="flex items-center gap-2 py-2 text-[13px]"
            data-testid="tag-txn"
          >
            <span className="truncate">
              {txn.display_name ?? txn.description_raw}
            </span>
            {txn.category && <CatPill category={txn.category} />}
            <span className="ml-auto font-mono">
              {formatMinorUnits(txn.amount_minor, txn.currency)}
            </span>
          </li>
        ))}
        {rows.length === 0 && !transactions.isPending && (
          <li className="py-3 text-muted-foreground text-sm">
            No transactions carry this tag.
          </li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="size-3.5" aria-hidden /> Export for expense
          report
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRenaming(true)
            setName(tag.name)
          }}
        >
          <Pencil className="size-3.5" aria-hidden /> Rename
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => remove.mutate({ path: { tag_id: tag.id } })}
          disabled={remove.isPending}
        >
          <Trash2 className="size-3.5" aria-hidden /> Delete tag
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        deleting detaches the tag everywhere — transactions stay put
      </p>
    </section>
  )
}
