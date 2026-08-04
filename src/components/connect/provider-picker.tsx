import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { errorDetail } from '@/api/client'
import { createConnection, createConnectSession } from '@/api/generated'
import {
  listConnectionsOptions,
  listConnectionsQueryKey,
  listProvidersOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type {
  ConnectionOut,
  ProviderCatalogEntry,
} from '@/api/generated/types.gen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PlaidExitError, usePlaidConnect } from '@/lib/plaid'
import { capabilityChips, orderedCatalog, PROVIDER_COPY } from '@/lib/providers'
import { cn } from '@/lib/utils'

// The provider picker (wireframe 7a, F8 CP0): "how Pinch reaches your
// bank" — a connection method, not a vendor pick. Everything factual is
// server-driven from the catalog endpoint (which providers exist, whether
// this instance configured them, what each delivers); only display copy is
// local (src/lib/providers). Plaid's Continue hands off to Plaid's own
// overlay exactly as before, through the provider-neutral contract:
// connect-session → widget → {provider, token} completion. MX's Continue
// stays disabled until its widget path lands (F8 CP1).
//
// The dialog closes before the widget opens: Plaid Link owns the viewport,
// and a modal Radix dialog underneath would fight its focus (the F7
// modal-focus lesson). A widget error reopens the picker with the notice
// inline; a plain dismissal stays silent, exactly like the old buttons.

export function ProviderPicker({
  open,
  onOpenChange,
  onConnected,
  onManual,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A connection completed and the list was invalidated — the host takes
   * over (sync window on the connections page, progress in the wizard). */
  onConnected: (connection: ConnectionOut) => void
  /** The footer's "Add the account manually instead". */
  onManual: () => void
}) {
  const queryClient = useQueryClient()
  const connect = usePlaidConnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Radix's default focus restore is unreliable for a controlled,
  // trigger-less dialog (the fix-drawer lesson) — capture whatever was
  // focused when open flipped true (the host's button) and restore it
  // ourselves on close. Render-time read: at the first open render the
  // opener still holds focus; Radix moves it only after commit.
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  }
  wasOpen.current = open

  // Fetched per open: the catalog is instance config (near-static), the
  // connections row is whatever the page already cached under the same key.
  const catalog = useQuery({ ...listProvidersOptions(), enabled: open })
  const connections = useQuery({ ...listConnectionsOptions(), enabled: open })
  const existing = connections.data?.items ?? []

  async function handleContinue(entry: ProviderCatalogEntry) {
    setError(null)
    setBusy(true)
    // Widget time: Plaid Link owns the viewport, the dialog steps aside.
    onOpenChange(false)
    try {
      const { data: session } = await createConnectSession({
        body: { provider: entry.provider },
        throwOnError: true,
      })
      const publicToken = await connect(session.token)
      if (publicToken === null) return // dismissed — not an error
      const { data: connection } = await createConnection({
        body: { provider: entry.provider, token: publicToken },
        throwOnError: true,
      })
      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      onConnected(connection)
    } catch (caught) {
      // The catalog already greys unconfigured providers, so a refusal here
      // is a race — and the backend's detail names the provider (M13), so
      // no PINCH_* env prose is needed on top.
      setError(
        caught instanceof PlaidExitError ? caught.message : errorDetail(caught),
      )
      onOpenChange(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="provider-picker"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          opener.current?.focus()
        }}
      >
        <div className="grid gap-1.5">
          <DialogTitle>Connect a bank</DialogTitle>
          <DialogDescription>
            Choose how Pinch reaches your bank. You can try another way if yours
            isn’t listed.
          </DialogDescription>
        </div>
        {existing.length > 0 && (
          // The pre-flight duplicate warning (7a): institution selection
          // happens inside the provider's widget, so this row is the one
          // chance to say "already connected" before credentials.
          <div
            data-testid="already-connected"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="label-caps text-muted-foreground">
              already connected
            </span>
            {existing.map((connection) => (
              <span
                key={connection.id}
                data-testid="connected-chip"
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
              >
                {connection.institution_name ?? 'Connected bank'}
                <span className="text-[10px] text-muted-foreground uppercase">
                  {PROVIDER_COPY[connection.provider].label}
                </span>
              </span>
            ))}
          </div>
        )}
        <div className="grid gap-2.5">
          {catalog.isPending ? (
            <>
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </>
          ) : catalog.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorDetail(catalog.error)}
            </p>
          ) : (
            orderedCatalog(catalog.data ?? []).map((entry) => (
              <ProviderCard
                key={entry.provider}
                entry={entry}
                busy={busy}
                onContinue={() => handleContinue(entry)}
              />
            ))
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onManual}
          className="text-center text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
        >
          Add the account manually instead
        </button>
      </DialogContent>
    </Dialog>
  )
}

function ProviderCard({
  entry,
  busy,
  onContinue,
}: {
  entry: ProviderCatalogEntry
  busy: boolean
  onContinue: () => void
}) {
  const copy = PROVIDER_COPY[entry.provider]
  // Plaid is the only wired widget this CP; MX renders honestly from the
  // catalog but its Continue waits for the MX Connect sheet (F8 CP1).
  const connectable = entry.configured && entry.provider === 'plaid'

  return (
    <div
      data-testid={`provider-card-${entry.provider}`}
      className={cn('rounded-lg border p-3', !entry.configured && 'opacity-60')}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{copy.label}</span>
        {entry.configured ? (
          copy.recommended && <Badge variant="secondary">recommended</Badge>
        ) : (
          <Badge variant="outline">unavailable</Badge>
        )}
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        {entry.configured
          ? copy.blurb
          : 'Not configured on this Pinch instance.'}
      </p>
      {entry.configured && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {capabilityChips(entry.capabilities).map((chip) => (
            <span
              key={chip.label}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px]',
                chip.muted
                  ? 'border-dashed text-muted-foreground'
                  : 'text-foreground',
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
      <Button
        size="sm"
        className="mt-3 w-full"
        disabled={busy || !connectable}
        aria-label={`Continue with ${copy.label}`}
        onClick={onContinue}
      >
        Continue
      </Button>
    </div>
  )
}
