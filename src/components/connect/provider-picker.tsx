import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  createConnection,
  createConnectSession,
  deleteAccount,
  deleteConnection,
} from '@/api/generated'
import {
  listAccountsQueryKey,
  listConnectionsOptions,
  listConnectionsQueryKey,
  listProvidersOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type {
  ConnectionOut,
  ConnectionProvider,
  ProviderCatalogEntry,
} from '@/api/generated/types.gen'
import { DuplicateGuardDialog } from '@/components/connect/duplicate-guard'
import { useMxConnect } from '@/components/connect/mx-connect-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectExitError } from '@/lib/connect-errors'
import { type DuplicateMatch, findDuplicateConnection } from '@/lib/connections'
import { usePlaidConnect } from '@/lib/plaid'
import {
  capabilityChips,
  orderedCatalog,
  PROVIDER_COPY,
  promotedProvider,
} from '@/lib/providers'
import { cn } from '@/lib/utils'

// The provider picker (wireframe 7a, F8 CP0): "how Pinch reaches your
// bank" — a connection method, not a vendor pick. Everything factual is
// server-driven from the catalog endpoint (which providers exist, whether
// this instance configured them, what each delivers); only display copy is
// local (src/lib/providers). Each Continue walks the provider-neutral
// contract — connect-session → widget → {provider, token} completion —
// through that provider's own boundary module: Plaid's overlay owns the
// viewport, MX renders iframed in a Pinch-owned sheet (7c, F8 CP1).
//
// The dialog closes before the widget opens: Plaid Link owns the viewport,
// and a modal Radix dialog underneath would fight its focus (the F7
// modal-focus lesson); the MX sheet is itself a Radix dialog and gets the
// same clear stage. A widget error reopens the picker with the notice
// inline. Coming back without connecting (7d) reopens it too: the tried
// method is marked — Pinch claims no knowledge of why; cancel and
// can't-find-my-bank are the same event to us — and the next configured
// method is promoted.

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
  const plaid = usePlaidConnect()
  const mx = useMxConnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Returned-empty bookkeeping (7d): methods that came back without
  // connecting this attempt. Cleared when the user closes the picker —
  // the marks narrate one connect attempt, not a permanent verdict.
  const [tried, setTried] = useState<ConnectionProvider[]>([])

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

  const promoted = promotedProvider(catalog.data ?? [], tried)

  // The duplicate guard's confirmation (7e): a promise the modal settles.
  const [guard, setGuard] = useState<{
    match: DuplicateMatch
    provider: ConnectionProvider
    resolve: (choice: 'keep' | 'add') => void
  } | null>(null)

  function confirmDuplicate(
    match: DuplicateMatch,
    provider: ConnectionProvider,
  ): Promise<'keep' | 'add'> {
    return new Promise((resolve) => {
      setGuard({
        match,
        provider,
        resolve: (choice) => {
          setGuard(null)
          resolve(choice)
        },
      })
    })
  }

  /** The provider's own widget, behind the shared three-outcome contract.
   * Institution metadata rides only where the provider states it before
   * completion (Plaid's Link onSuccess); MX learns it at completion. */
  async function launchWidget(
    entry: ProviderCatalogEntry,
    sessionToken: string,
  ): Promise<{
    token: string
    institution: { id: string; name: string } | null
  } | null> {
    if (entry.provider === 'mx') {
      const memberGuid = await mx.connect(sessionToken)
      return memberGuid === null
        ? null
        : { token: memberGuid, institution: null }
    }
    const success = await plaid(sessionToken)
    return success === null
      ? null
      : { token: success.publicToken, institution: success.institution }
  }

  async function handleContinue(entry: ProviderCatalogEntry) {
    setError(null)
    setBusy(true)
    // Widget time: the provider's widget owns the stage, the dialog steps
    // aside (the prop directly — user closes go through handleOpenChange).
    onOpenChange(false)
    try {
      const { data: session } = await createConnectSession({
        body: { provider: entry.provider },
        throwOnError: true,
      })
      const outcome = await launchWidget(entry, session.token)
      if (outcome === null) {
        // Came back without connecting (7d): a fork, not a failure — mark
        // the method tried and return to the picker to promote the next.
        setTried((prior) =>
          prior.includes(entry.provider) ? prior : [...prior, entry.provider],
        )
        onOpenChange(true)
        return
      }

      // The duplicate guard (7e), per-provider timing: institution
      // identity is only knowable post-widget, and each provider states
      // it at a different moment.
      if (entry.provider !== 'mx' && outcome.institution !== null) {
        // Plaid: Link's onSuccess metadata names the institution BEFORE
        // the exchange — guard here, and "keep" simply never completes
        // (the unexchanged public token expires harmlessly). Metadata
        // omitted means the guard can miss — soft by design.
        const match = findDuplicateConnection(existing, {
          provider: entry.provider,
          providerInstitutionId: outcome.institution.id,
          institutionName: outcome.institution.name,
        })
        if (match !== null) {
          const choice = await confirmDuplicate(match, entry.provider)
          if (choice === 'keep') return
        }
      }

      const { data: connection } = await createConnection({
        body: { provider: entry.provider, token: outcome.token },
        throwOnError: true,
      })

      if (entry.provider === 'mx') {
        // MX: memberConnected carries only guids, so the institution is
        // only known once completion created the connection — complete
        // first, then guard. "Keep the existing connection" undoes the
        // walk: disconnect deletes the MX member (the 7e annotation's
        // cleanup) and leaves the accounts disconnected, then the
        // hard-delete clears that debris — zero new artifacts.
        const match = findDuplicateConnection(
          existing,
          {
            provider: entry.provider,
            providerInstitutionId: connection.provider_institution_id,
            institutionName: connection.institution_name,
          },
          { excludeId: connection.id },
        )
        if (match !== null) {
          const choice = await confirmDuplicate(match, entry.provider)
          if (choice === 'keep') {
            await deleteConnection({
              path: { connection_id: connection.id },
              throwOnError: true,
            })
            await Promise.all(
              connection.accounts.map((account) =>
                deleteAccount({
                  path: { account_id: account.id },
                  throwOnError: true,
                }),
              ),
            )
            queryClient.invalidateQueries({
              queryKey: listConnectionsQueryKey(),
            })
            queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
            return
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      setTried([])
      onConnected(connection)
    } catch (caught) {
      // The catalog already greys unconfigured providers, so a refusal here
      // is a race — and the backend's detail names the provider (M13), so
      // no PINCH_* env prose is needed on top.
      setError(
        caught instanceof ConnectExitError
          ? caught.message
          : errorDetail(caught),
      )
      onOpenChange(true)
    } finally {
      setBusy(false)
    }
  }

  // User-driven closes (Escape, ✕, overlay) end the attempt: the tried
  // marks and any notice reset so the next open starts clean. Programmatic
  // closes in handleContinue call the prop directly and skip this.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTried([])
      setError(null)
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
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
              {tried.length > 0
                ? 'Nothing was connected — pick another way in.'
                : 'Choose how Pinch reaches your bank. You can try another way if yours isn’t listed.'}
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
                  tried={tried.includes(entry.provider)}
                  promoted={entry.provider === promoted}
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
      {mx.sheet}
      {guard && (
        <DuplicateGuardDialog
          match={guard.match}
          attemptProvider={guard.provider}
          onKeep={() => guard.resolve('keep')}
          onAdd={() => guard.resolve('add')}
        />
      )}
    </>
  )
}

function ProviderCard({
  entry,
  busy,
  tried,
  promoted,
  onContinue,
}: {
  entry: ProviderCatalogEntry
  busy: boolean
  /** Came back without connecting this attempt (7d). */
  tried: boolean
  /** The next way in after another method came back empty (7d). */
  promoted: boolean
  onContinue: () => void
}) {
  const copy = PROVIDER_COPY[entry.provider]
  const connectable = entry.configured

  return (
    <div
      data-testid={`provider-card-${entry.provider}`}
      className={cn('rounded-lg border p-3', !entry.configured && 'opacity-60')}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{copy.label}</span>
        {!entry.configured ? (
          <Badge variant="outline">unavailable</Badge>
        ) : tried ? (
          <Badge variant="outline">tried</Badge>
        ) : (
          copy.recommended && <Badge variant="secondary">recommended</Badge>
        )}
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        {!entry.configured
          ? 'Not configured on this Pinch instance.'
          : tried
            ? // The honest version (7d): cancel and can't-find-my-bank are
              // the same event to us, so the copy claims nothing more.
              `Came back without connecting. ${copy.label} doesn’t tell us why.`
            : copy.blurb}
      </p>
      {entry.configured && !tried && (
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
        variant={tried ? 'outline' : 'default'}
        className="mt-3 w-full"
        disabled={busy || !connectable}
        // The promoted label ("Try MX") is its own accessible name — an
        // aria-label overriding it would break label-in-name.
        aria-label={
          tried
            ? `Try ${copy.label} again`
            : promoted
              ? undefined
              : `Continue with ${copy.label}`
        }
        onClick={onContinue}
      >
        {tried ? 'Try again' : promoted ? `Try ${copy.label}` : 'Continue'}
      </Button>
    </div>
  )
}
