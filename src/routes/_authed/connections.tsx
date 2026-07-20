import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { errorDetail } from '@/api/client'
import { createConnection, createLinkToken } from '@/api/generated'
import {
  deleteConnectionMutation,
  listAccountsQueryKey,
  listConnectionsOptions,
  listConnectionsQueryKey,
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

export const Route = createFileRoute('/_authed/connections')({
  component: ConnectionsPage,
})

// How long a client-triggered sync gets watched before the poll gives up.
const SYNC_WINDOW_MS = 120_000
const SYNC_POLL_MS = 3_000

type SyncWindow = { baseline: string | null; startedAt: number }

function ConnectionsPage() {
  const queryClient = useQueryClient()
  // Poll-while-pending: only client-triggered syncs are watched, and the
  // list refetches only while a window is open.
  const [syncWindows, setSyncWindows] = useState<Record<string, SyncWindow>>({})
  const watching = Object.keys(syncWindows).length > 0

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
        startedAt: Date.now(),
      },
    }))
  }, [])

  const items = connections.data?.items
  useEffect(() => {
    if (!items || !watching) return
    const now = Date.now()
    const closed: string[] = []
    let synced = false
    for (const [id, window] of Object.entries(syncWindows)) {
      const connection = items.find((candidate) => candidate.id === id)
      // A connection absent from the list is NOT closed here: right after
      // an exchange the cached list is stale and doesn't contain the new
      // row yet — treating that as "deleted" killed windows at birth.
      // Genuinely-gone connections age out via the expiry below.
      const finished =
        connection &&
        (connection.last_synced_at !== window.baseline ||
          connection.status !== 'active')
      if (finished) synced = true
      if (finished || now - window.startedAt > SYNC_WINDOW_MS) {
        closed.push(id)
      }
    }
    if (closed.length > 0) {
      setSyncWindows((windows) => {
        const next = { ...windows }
        for (const id of closed) delete next[id]
        return next
      })
      if (synced) {
        // Balances arrived — make the money pages re-ask.
        queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      }
    }
  }, [items, watching, syncWindows, queryClient])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-xl">Connections</h1>
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
              syncing={connection.id in syncWindows}
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
      const { data: tokenOut } = await createLinkToken({
        body: null, // creation mode; repair passes a connection_id (CP2)
        throwOnError: true,
      })
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
          {error.includes('not configured') &&
            ' — set PINCH_PLAID_CLIENT_ID and PINCH_PLAID_SECRET on the backend to enable bank connections.'}
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
  syncing = false,
}: {
  connection: ConnectionOut
  syncing?: boolean
}) {
  const count = connection.accounts.length

  return (
    <Card data-testid="connection-card">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              {/* institution_name arrives with the backend enabler (CP3) */}
              Plaid connection
            </span>
            <Badge variant={STATUS_VARIANT[connection.status]}>
              {connection.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {syncing
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
        <DisconnectButton connection={connection} />
      </CardContent>
    </Card>
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
