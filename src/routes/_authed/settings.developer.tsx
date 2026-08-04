import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import {
  createPatMutation,
  listPatsOptions,
  listPatsQueryKey,
  revokePatMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { PatCreatedOut, PatScope } from '@/api/generated/types.gen'
import { MutationError } from '@/components/auth-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/time'

// The Developer API pane (F7 CP2, wireframe s23): PAT management honoring
// show-once — tokens are hashed server-side (M3), so the secret appears
// exactly at creation and never again. No masked value with a Copy button
// ever existed to copy.
export const Route = createFileRoute('/_authed/settings/developer')({
  component: DeveloperPane,
})

function DeveloperPane() {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-sm">Developer API</h2>
      <p className="mt-1 text-sm">
        The full app is available via the{' '}
        <code className="font-mono">pinch</code> CLI over the Developer API.
      </p>
      <TokenManager />
    </Card>
  )
}

function TokenManager() {
  const queryClient = useQueryClient()
  const pats = useQuery(listPatsOptions())
  const [creating, setCreating] = useState(false)
  // The one-time reveal: held in state only, gone on unmount — exactly the
  // secret's lifetime in this browser.
  const [created, setCreated] = useState<PatCreatedOut | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listPatsQueryKey() })
  const revoke = useMutation({
    ...revokePatMutation(),
    onSuccess: invalidate,
  })

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="label-caps">Personal access tokens</span>
        {!creating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreated(null)
              setCreating(true)
            }}
          >
            New token
          </Button>
        )}
      </div>
      {creating && (
        <NewTokenForm
          onCreated={(pat) => {
            setCreated(pat)
            setCreating(false)
            invalidate()
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {created && <ShowOnceRow pat={created} />}
      <ul className="mt-2 divide-y">
        {pats.data?.items.map((pat) => (
          <li
            key={pat.id}
            data-testid="pat-row"
            className="flex items-center gap-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{pat.name}</p>
              <p className="text-muted-foreground text-xs">
                <span className="font-mono">{pat.scopes.join(' ')}</span>
                {' · created '}
                {formatDate(pat.created_at)}
                {' · '}
                <span className="font-mono">{pat.display_prefix}…</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate({ path: { pat_id: pat.id } })}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NewTokenForm({
  onCreated,
  onCancel,
}: {
  onCreated: (pat: PatCreatedOut) => void
  onCancel: () => void
}) {
  const nameId = useId()
  const writeId = useId()
  const pennyId = useId()
  const create = useMutation({
    ...createPatMutation(),
    onSuccess: (pat) => onCreated(pat),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    // Every token reads; write and penny are the optional grants.
    const scopes: PatScope[] = ['read']
    if (form.get('write')) scopes.push('write')
    if (form.get('penny')) scopes.push('penny')
    create.mutate({ body: { name: String(form.get('name')), scopes } })
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 rounded-lg border p-3">
      <div className="grid gap-1.5">
        <Label htmlFor={nameId} className="label-caps">
          Token name
        </Label>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={100}
          placeholder="laptop CLI"
          className="max-w-xs"
        />
      </div>
      <div className="flex items-center gap-5 text-sm">
        <label htmlFor={writeId} className="flex items-center gap-1.5">
          <input
            id={writeId}
            name="write"
            type="checkbox"
            className="accent-primary"
          />
          Write access
        </label>
        <label htmlFor={pennyId} className="flex items-center gap-1.5">
          <input
            id={pennyId}
            name="penny"
            type="checkbox"
            className="accent-primary"
          />
          Penny
        </label>
        <span className="text-muted-foreground text-xs">
          every token can read
        </span>
      </div>
      <MutationError mutation={create} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          Create token
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ShowOnceRow({ pat }: { pat: PatCreatedOut }) {
  const [copied, setCopied] = useState(false)

  return (
    <div
      data-testid="pat-created"
      className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
    >
      <p className="font-medium text-sm">{pat.name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
          {pat.token}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(pat.token)
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-1.5 text-muted-foreground text-xs">
        You won't see this again — Pinch keeps only a hash.
      </p>
    </div>
  )
}
