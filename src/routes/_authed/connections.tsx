import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { errorDetail, statusOf } from '@/api/client'
import {
  createConnection,
  createLinkToken,
  refreshConnection,
} from '@/api/generated'
import {
  deleteConnectionMutation,
  listAccountsQueryKey,
  listConnectionsOptions,
  listConnectionsQueryKey,
  refreshConnectionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { ConnectionOut } from '@/api/generated/types.gen'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PlaidExitError, usePlaidConnect } from '@/lib/plaid'
import { relativeTime } from '@/lib/time'

type ConnectionsSearch = {
  /** A connection id to open a sync window for on arrival — how the OAuth
   * return route hands off its freshly exchanged connection. */
  watch?: string
}

export const Route = createFileRoute('/_authed/connections')({
  staticData: { title: 'Connections' },
  validateSearch: (search: Record<string, unknown>): ConnectionsSearch => ({
    watch: typeof search.watch === 'string' ? search.watch : undefined,
  }),
  component: ConnectionsPage,
})

// How long a client-triggered sync gets watched before the poll gives up.
const SYNC_WINDOW_MS = 120_000
const SYNC_POLL_MS = 3_000

type SyncWindow = {
  baseline: string | null
  /** Status at window open — repair windows watch non-active rows, so
   * "finished" means changed-from-baseline, never !== 'active'. */
  baselineStatus: ConnectionOut['status']
  startedAt: number
  /** Cap reached: stop polling, show "still working" until data moves. */
  expired: boolean
}

function ConnectionsPage() {
  const queryClient = useQueryClient()
  // Poll-while-pending: only client-triggered syncs are watched, and the
  // list refetches only while a live (non-expired) window is open.
  const [syncWindows, setSyncWindows] = useState<Record<string, SyncWindow>>({})
  const watching = Object.values(syncWindows).some((window) => !window.expired)

  const connections = useQuery({
    ...listConnectionsOptions(),
    throwOnError: true,
    refetchInterval: watching ? SYNC_POLL_MS : undefined,
  })

  const openSyncWindow = useCallback((connection: ConnectionOut) => {
    setSyncWindows((windows) => ({
      ...windows,
      [connection.id]: {
        baseline: connection.last_synced_at,
        baselineStatus: connection.status,
        startedAt: Date.now(),
        expired: false,
      },
    }))
  }, [])

  // Expiry runs on a real timer: the data-driven effect below can't see a
  // stalled sync (structural sharing keeps unchanged responses referentially
  // identical, so it never re-runs while nothing changes).
  useEffect(() => {
    if (!watching) return
    const timer = setInterval(() => {
      const now = Date.now()
      setSyncWindows((windows) => {
        let changed = false
        const next = { ...windows }
        for (const [id, window] of Object.entries(next)) {
          if (!window.expired && now - window.startedAt > SYNC_WINDOW_MS) {
            next[id] = { ...window, expired: true }
            changed = true
          }
        }
        return changed ? next : windows
      })
    }, 5_000)
    return () => clearInterval(timer)
  }, [watching])

  // The OAuth return route hands off via ?watch=<id>: open its window once
  // the connection shows up, then drop the param.
  const { watch } = Route.useSearch()
  const navigate = Route.useNavigate()
  const items = connections.data?.items
  useEffect(() => {
    if (!watch || !items) return
    const connection = items.find((candidate) => candidate.id === watch)
    if (connection) openSyncWindow(connection)
    // Clear the param either way — an unfound id would dangle forever.
    navigate({ search: {}, replace: true })
  }, [watch, items, openSyncWindow, navigate])

  useEffect(() => {
    if (!items) return
    const closed: string[] = []
    let balancesArrived = false
    for (const [id, window] of Object.entries(syncWindows)) {
      const connection = items.find((candidate) => candidate.id === id)
      if (!connection) continue
      // A connection absent from the list is NOT closed here: right after
      // an exchange the cached list is stale and doesn't contain the new
      // row yet — treating that as "deleted" killed windows at birth.
      // Genuinely-gone connections age out via the expiry timer.
      const syncCompleted = connection.last_synced_at !== window.baseline
      const statusChanged = connection.status !== window.baselineStatus
      if (syncCompleted) balancesArrived = true
      if (syncCompleted || statusChanged) closed.push(id)
    }
    if (closed.length > 0) {
      setSyncWindows((windows) => {
        const next = { ...windows }
        for (const id of closed) delete next[id]
        return next
      })
      // Only a completed sync moves money — a status flip (e.g. a sync
      // failing into error) closes the window without invalidating.
      if (balancesArrived) {
        queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      }
    }
  }, [items, syncWindows, queryClient])

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* The screen title lives in the shell's top bar; the page keeps its
          primary action (wireframe #16's "Connect bank"). */}
      <div className="flex items-center justify-end">
        <ConnectBank onConnected={openSyncWindow} />
      </div>
      <div className="mt-4 space-y-3">
        {connections.isPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : connections.data && connections.data.items.length > 0 ? (
          connections.data.items.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              syncState={
                syncWindows[connection.id] === undefined
                  ? undefined
                  : syncWindows[connection.id].expired
                    ? 'expired'
                    : 'watching'
              }
              onSyncTriggered={openSyncWindow}
            />
          ))
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              <p className="font-medium text-foreground">No connections yet</p>
              <p className="mt-1">
                Connect a bank to sync accounts automatically.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ConnectBank({
  onConnected,
}: {
  onConnected: (connection: ConnectionOut) => void
}) {
  const queryClient = useQueryClient()
  const connect = usePlaidConnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setError(null)
    setBusy(true)
    try {
      let tokenOut: { link_token: string }
      try {
        ;({ data: tokenOut } = await createLinkToken({
          body: null, // creation mode; repair passes a connection_id (CP2)
          throwOnError: true,
        }))
      } catch (caught) {
        // A 403 on link-token means the keyless stance: Plaid isn't
        // configured on this instance (status-keyed, not prose-sniffed).
        setError(
          statusOf(caught) === 403
            ? `${errorDetail(caught)} — set PINCH_PLAID_CLIENT_ID and PINCH_PLAID_SECRET on the backend to enable bank connections.`
            : errorDetail(caught),
        )
        return
      }
      const publicToken = await connect(tokenOut.link_token)
      if (publicToken === null) return // dismissed — not an error
      const { data: connection } = await createConnection({
        body: { public_token: publicToken },
        throwOnError: true,
      })
      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      onConnected(connection)
    } catch (caught) {
      setError(
        caught instanceof PlaidExitError ? caught.message : errorDetail(caught),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button onClick={handleConnect} disabled={busy}>
        Connect bank
      </Button>
    </div>
  )
}

const STATUS_VARIANT = {
  active: 'secondary',
  error: 'destructive',
  reauth_required: 'outline',
} as const

function ConnectionCard({
  connection,
  syncState,
  onSyncTriggered,
}: {
  connection: ConnectionOut
  syncState?: 'watching' | 'expired'
  onSyncTriggered: (connection: ConnectionOut) => void
}) {
  const count = connection.accounts.length
  const broken = connection.status !== 'active'

  return (
    <Card data-testid="connection-card" data-connection-id={connection.id}>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              {connection.institution_name ?? 'Plaid connection'}
            </span>
            <Badge variant={STATUS_VARIANT[connection.status]}>
              {connection.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {syncState === 'expired'
              ? 'Still working — check back shortly'
              : syncState === 'watching'
                ? connection.last_synced_at
                  ? 'Syncing…'
                  : 'First sync running…'
                : connection.last_synced_at
                  ? `Synced ${relativeTime(connection.last_synced_at)}`
                  : 'Never synced'}
            {' · '}
            {count} {count === 1 ? 'account' : 'accounts'}
          </p>
          {connection.error_detail && (
            <p className="text-destructive text-sm">
              {connection.error_detail}
            </p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {broken && (
            <RepairButton
              connection={connection}
              onTriggered={onSyncTriggered}
            />
          )}
          {/* Expired windows leave Refresh usable: clicking re-opens the
              window with a fresh baseline, so a dead sync never locks the
              verb until remount. Only a live watch disables it. */}
          <RefreshButton
            connection={connection}
            disabled={syncState === 'watching'}
            onTriggered={onSyncTriggered}
          />
          <DisconnectButton connection={connection} />
        </span>
      </CardContent>
    </Card>
  )
}

function RefreshButton({
  connection,
  disabled,
  onTriggered,
}: {
  connection: ConnectionOut
  disabled: boolean
  onTriggered: (connection: ConnectionOut) => void
}) {
  const refresh = useMutation({
    ...refreshConnectionMutation(),
    onSuccess: () => onTriggered(connection),
  })

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled || refresh.isPending}
      onClick={() => refresh.mutate({ path: { connection_id: connection.id } })}
    >
      Refresh
    </Button>
  )
}

function RepairButton({
  connection,
  onTriggered,
}: {
  connection: ConnectionOut
  onTriggered: (connection: ConnectionOut) => void
}) {
  const queryClient = useQueryClient()
  const connect = usePlaidConnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRepair() {
    setError(null)
    setBusy(true)
    try {
      // Update-mode token for the same Item — repair, never re-create
      // (a fresh connect on a broken connection duplicates accounts).
      const { data: tokenOut } = await createLinkToken({
        body: { connection_id: connection.id },
        throwOnError: true,
      })
      const result = await connect(tokenOut.link_token, {
        connectionId: connection.id,
      })
      if (result === null) return // dismissed — not an error
      // Update mode needs no exchange; the follow-up sync proves the fix.
      await refreshConnection({
        path: { connection_id: connection.id },
        throwOnError: true,
      })
      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      onTriggered(connection)
    } catch (caught) {
      setError(
        caught instanceof PlaidExitError ? caught.message : errorDetail(caught),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-destructive text-sm">
          {error}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={handleRepair}
      >
        Repair
      </Button>
    </span>
  )
}

function DisconnectButton({ connection }: { connection: ConnectionOut }) {
  const queryClient = useQueryClient()
  const disconnect = useMutation({
    ...deleteConnectionMutation(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      // The accounts survive, newly manual — make their page re-ask too.
      queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disconnect.isPending}>
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect this bank?</AlertDialogTitle>
          <AlertDialogDescription>
            Pinch stops syncing from your bank. Your accounts and their history
            stay, as manual accounts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              disconnect.mutate({ path: { connection_id: connection.id } })
            }
          >
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
