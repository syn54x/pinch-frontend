import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  getTransactionOptions,
  getTransactionQueryKey,
  listAccountsOptions,
  listCategoriesOptions,
  listTagsQueryKey,
  listTransactionsQueryKey,
  patchTransactionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type {
  TransactionOut,
  TransactionPatchIn,
} from '@/api/generated/types.gen'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CatPill } from './catpill'
import { FilterChip } from './filter-chip'
import {
  activeProvenance,
  amountClass,
  formatDayHeading,
  payeeOf,
  signedAmount,
} from './model'
import { ProvenanceBadge } from './provenance-badge'

// The Inspector (CONTEXT.md): the pane beside the Register list where one
// transaction shows everything — and every field edits in place via PATCH.
// A read surface for review state: the only review affordance is a route to
// the Inbox, never a verb.

export function Inspector({
  txnId,
  seed,
}: {
  txnId: string | undefined
  /** The already-loaded list row, so selection paints instantly. */
  seed: TransactionOut | undefined
}) {
  return (
    <div data-testid="inspector" className="min-w-0 flex-1 overflow-y-auto p-4">
      {txnId ? (
        <InspectorBody key={txnId} txnId={txnId} seed={seed} />
      ) : (
        <>
          <div className="label-caps">Transaction</div>
          <p className="mt-2 max-w-[36ch] text-muted-foreground text-sm">
            Select a transaction to see everything about it — and edit it in
            place.
          </p>
        </>
      )}
    </div>
  )
}

function InspectorBody({
  txnId,
  seed,
}: {
  txnId: string
  seed: TransactionOut | undefined
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    ...getTransactionOptions({ path: { txn_id: txnId } }),
    // The seed is the same resource one hydration older — good enough to
    // paint with while the fresh read lands.
    placeholderData: seed,
    throwOnError: true,
  })
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const categories = useQuery(listCategoriesOptions({ query: { limit: 100 } }))

  const patch = useMutation({
    ...patchTransactionMutation(),
    onSuccess: (updated) => {
      // The response is the fresh truth for this transaction; the listing
      // (and the tag vocabulary a new tag may have grown) refetch.
      queryClient.setQueryData(
        getTransactionQueryKey({ path: { txn_id: txnId } }),
        updated,
      )
      queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
      queryClient.invalidateQueries({ queryKey: listTagsQueryKey() })
    },
  })
  const sendPatch = (body: TransactionPatchIn) =>
    patch.mutate({ path: { txn_id: txnId }, body })

  const txn = detail.data
  if (!txn) return <InspectorSkeleton />

  const account = accounts.data?.items.find((a) => a.id === txn.account_id)
  const provenance = activeProvenance(txn)
  const isTransfer = txn.transfer !== null
  const splits = txn.splits ?? []

  return (
    <div>
      <div className="label-caps">Transaction</div>

      <DisplayNameField
        txn={txn}
        disabled={patch.isPending}
        onSave={(display_name) => sendPatch({ display_name })}
      />
      <div
        className={cn('amount mt-0.5 text-xl', amountClass(txn.amount_minor))}
      >
        {signedAmount(txn.amount_minor, txn.currency)}
      </div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">
        {formatDayHeading(txn.date)}
        {account && (
          <>
            {' · '}
            {account.label}
            {account.mask ? ` ···${account.mask}` : ''}
          </>
        )}
        {' · '}
        {txn.pending ? 'pending' : 'posted'}
      </div>

      {txn.reviewed_at === null && (
        <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5 text-[12.5px]">
          <span className="text-muted-foreground">Awaiting review —</span>
          <Link
            to="/inbox"
            data-testid="inspector-inbox-link"
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Review in Inbox
          </Link>
        </div>
      )}

      {patch.isError && (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[12.5px] text-destructive"
        >
          <span>{errorDetail(patch.error)}</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => patch.variables && patch.mutate(patch.variables)}
          >
            Retry
          </button>
        </div>
      )}

      <hr className="my-3.5" />

      <div className="label-caps">Category</div>
      {isTransfer ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Transfer — excluded from spending
        </p>
      ) : splits.length > 0 ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Split — categories live on the lines below
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {txn.category ? (
            <CatPill category={txn.category} />
          ) : (
            <span className="text-[12.5px] text-muted-foreground">
              Uncategorized
            </span>
          )}
          {provenance && <ProvenanceBadge provenance={provenance} />}
          <FilterChip
            name="Set category"
            label="change"
            active={false}
            selected={txn.category?.id}
            onSelect={(id) => sendPatch({ category_id: id ?? null })}
            options={[
              { value: undefined, label: 'Uncategorized' },
              ...(categories.data?.items ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                render: <CatPill category={c} />,
              })),
            ]}
          />
        </div>
      )}

      {splits.length > 0 && (
        <section className="mt-3.5">
          <div className="label-caps">Split · {splits.length} lines</div>
          <ul className="mt-1.5 space-y-1.5">
            {splits.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: split lines have no durable ids (backend: "Line ids are not durable across a re-PUT") — position is their identity.
              <li key={index} className="flex items-center gap-2">
                {line.category ? (
                  <CatPill category={line.category} />
                ) : (
                  <span className="text-[12.5px] text-muted-foreground">
                    Uncategorized
                  </span>
                )}
                {line.memo && (
                  <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">
                    {line.memo}
                  </span>
                )}
                <span
                  className={cn(
                    'amount ml-auto text-[12.5px]',
                    amountClass(line.amount_minor),
                  )}
                >
                  {signedAmount(line.amount_minor, txn.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="label-caps mt-3.5">Raw description</div>
      <p className="mt-1 break-words font-mono text-[11.5px] text-muted-foreground">
        {txn.description_raw}
      </p>

      <div className="label-caps mt-3.5">Tags</div>
      <TagsField
        txn={txn}
        disabled={patch.isPending}
        onSave={(tags) => sendPatch({ tags })}
      />

      <div className="label-caps mt-3.5">Notes</div>
      <NotesField
        txn={txn}
        disabled={patch.isPending}
        onSave={(notes) => sendPatch({ notes })}
      />
    </div>
  )
}

// The payee line, editable in place: the pencil swaps the title for an
// input; commit on Enter/blur, Escape cancels. An emptied field clears the
// override (display_name: null shows the raw description again).
function DisplayNameField({
  txn,
  disabled,
  onSave,
}: {
  txn: TransactionOut
  disabled: boolean
  onSave: (displayName: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    setEditing(false)
    const next = draft.trim() || null
    if (next !== txn.display_name) onSave(next)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Display name"
        className="mt-1 font-semibold text-base"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <h2 className="min-w-0 truncate font-semibold text-base">
        {payeeOf(txn)}
      </h2>
      <button
        type="button"
        aria-label="Edit display name"
        className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2"
        onClick={() => {
          setDraft(txn.display_name ?? '')
          setEditing(true)
        }}
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

// Tags edit as a whole set (the PATCH contract): removing a chip or adding
// a name sends the complete reconciled list; new names implicit-create.
function TagsField({
  txn,
  disabled,
  onSave,
}: {
  txn: TransactionOut
  disabled: boolean
  onSave: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const names = txn.tags.map((tag) => tag.name)

  const add = () => {
    const name = draft.trim().replace(/^#/, '')
    setDraft('')
    if (!name || names.some((n) => n.toLowerCase() === name.toLowerCase()))
      return
    onSave([...names, name])
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {txn.tags.map((tag) => (
        <span
          key={tag.id}
          data-testid="tag-chip"
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-mono text-[11.5px] text-muted-foreground"
        >
          #{tag.name}
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            disabled={disabled}
            className="rounded-full hover:text-foreground focus-visible:outline-2"
            onClick={() => onSave(names.filter((n) => n !== tag.name))}
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <Input
        aria-label="Add tag"
        placeholder="+ add tag"
        disabled={disabled}
        className="h-6 w-28 rounded-full px-2 font-mono text-[11.5px]"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') add()
        }}
        onBlur={() => {
          if (draft.trim()) add()
        }}
      />
    </div>
  )
}

// Notes save on blur when changed; empty clears (notes: null).
function NotesField({
  txn,
  disabled,
  onSave,
}: {
  txn: TransactionOut
  disabled: boolean
  onSave: (notes: string | null) => void
}) {
  const [draft, setDraft] = useState(txn.notes ?? '')

  // A patch elsewhere (or a fresh read) may change notes under us; follow
  // the server unless the user is mid-edit of a different value.
  const server = txn.notes ?? ''
  const [lastServer, setLastServer] = useState(server)
  useEffect(() => {
    if (server !== lastServer) {
      setLastServer(server)
      setDraft(server)
    }
  }, [server, lastServer])

  return (
    <textarea
      aria-label="Notes"
      placeholder="Add a note…"
      disabled={disabled}
      className="mt-1.5 min-h-[52px] w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-[12.5px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim() ? draft : null
        if (next !== txn.notes) onSave(next)
      }}
    />
  )
}

function InspectorSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="label-caps">Transaction</div>
      <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
      <div className="h-3 w-56 animate-pulse rounded-md bg-muted" />
    </div>
  )
}
