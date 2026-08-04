import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useId } from 'react'
import {
  changePasswordMutation,
  listSessionsOptions,
  listSessionsQueryKey,
  revokeSessionMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { MutationError } from '@/components/auth-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate, relativeTime } from '@/lib/time'

// The Security pane (F7 CP2, wireframe s23): rotate the password without
// the email-reset flow, and see everywhere you're signed in. The backend
// (#84) revokes every pre-change session and hands this browser a fresh
// cookie on the response — the user never notices; a thief's stolen copy
// dies.
export const Route = createFileRoute('/_authed/settings/security')({
  component: SecurityPane,
})

function SecurityPane() {
  return (
    <div className="grid gap-4">
      <ChangePasswordCard />
      <SessionsCard />
    </div>
  )
}

function ChangePasswordCard() {
  const queryClient = useQueryClient()
  const currentId = useId()
  const newId = useId()
  const change = useMutation({
    ...changePasswordMutation(),
    onSuccess: () =>
      // Every other session just died server-side; the list must say so.
      queryClient.invalidateQueries({ queryKey: listSessionsQueryKey() }),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    change.mutate({
      body: {
        current_password: String(form.get('current_password')),
        new_password: String(form.get('new_password')),
      },
    })
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-sm">Change password</h2>
      {change.isSuccess ? (
        <p role="status" className="mt-3 text-sm">
          Password updated. Your other sessions have been signed out; this one
          carries on.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 grid max-w-xs gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={currentId} className="label-caps">
              Current password
            </Label>
            <Input
              id={currentId}
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={newId} className="label-caps">
              New password
            </Label>
            <Input
              id={newId}
              name="new_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <MutationError mutation={change} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={change.isPending}
          >
            Update password
          </Button>
          <p className="text-muted-foreground text-xs">
            New passwords are checked against known breach lists. Changing your
            password signs out your other sessions.
          </p>
        </form>
      )}
    </Card>
  )
}

function SessionsCard() {
  const queryClient = useQueryClient()
  const sessions = useQuery(listSessionsOptions())
  const revoke = useMutation({
    ...revokeSessionMutation(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: listSessionsQueryKey() }),
  })

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-sm">Sessions</h2>
      <p className="mt-1 text-muted-foreground text-xs">
        Everywhere you're signed in. Revoking a session kills its cookie
        immediately — a stolen one isn't permanent.
      </p>
      <ul className="mt-3 divide-y">
        {sessions.data?.items.map((session) => (
          <li
            key={session.id}
            data-testid="session-row"
            className="flex items-center gap-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-sm">
                <span className="truncate">
                  {session.client_hint ?? 'Unknown device'}
                </span>
                {session.current && (
                  <Badge variant="outline">this session</Badge>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                created {formatDate(session.created_at)} · last seen{' '}
                {relativeTime(session.last_seen_at)}
              </p>
            </div>
            {!session.current && (
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate({ path: { session_id: session.id } })
                }
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
