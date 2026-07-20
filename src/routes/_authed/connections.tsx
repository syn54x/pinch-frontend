import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
import { relativeTime } from '@/lib/time'

export const Route = createFileRoute('/_authed/connections')({
  component: ConnectionsPage,
})

function ConnectionsPage() {
  const connections = useQuery({
    ...listConnectionsOptions(),
    throwOnError: true,
  })

  return (
    <div>
      <h1 className="font-semibold text-xl">Connections</h1>
      <div className="mt-4 space-y-3">
        {connections.isPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : connections.data && connections.data.items.length > 0 ? (
          connections.data.items.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} />
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

const STATUS_VARIANT = {
  active: 'secondary',
  error: 'destructive',
  reauth_required: 'outline',
} as const

function ConnectionCard({ connection }: { connection: ConnectionOut }) {
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
            {connection.last_synced_at
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
