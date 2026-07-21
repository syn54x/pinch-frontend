import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { isUnauthorized } from '@/api/client'
import {
  logoutMutation,
  meOptions,
  requestEmailVerificationMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

// The login wall: every child route requires a live session. The server is
// the source of truth — `GET /me` succeeds (session cookie valid) or the
// visitor is sent to login carrying their original destination.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meOptions())
    } catch (error) {
      // Only "no valid session" belongs at login; a 500 or unreachable
      // backend must surface as an error, not a confusing login loop.
      if (!isUnauthorized(error)) throw error
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AuthedLayout,
  errorComponent: AuthedError,
})

function AuthedError() {
  // The catch-all for render/load failures behind the login wall (session
  // expiry never lands here — the 401 interceptor redirects first). A full
  // reload is the honest retry: it re-runs the guard and every query.
  //
  // Invariant: child routes throw here because they have no errorComponent
  // of their own and the router has no defaultErrorComponent. Adding either
  // would silently intercept below this boundary and lose the retry.
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <p className="font-medium">Something went wrong loading this page.</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => window.location.reload()}
      >
        Try again
      </Button>
    </div>
  )
}

function AuthedLayout() {
  const router = useRouter()
  const { queryClient } = Route.useRouteContext()
  const logout = useMutation({
    ...logoutMutation(),
    onSuccess: () => {
      // The session is gone server-side; drop every cached answer that
      // presumed it (starting with /me) and go to login.
      queryClient.clear()
      router.history.push('/login')
    },
  })

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Pinch</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/accounts" className="hover:underline">
              Accounts
            </Link>
            <Link to="/connections" className="hover:underline">
              Connections
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            disabled={logout.isPending}
            onClick={() => logout.mutate({})}
          >
            Log out
          </Button>
        </div>
      </header>
      <VerifyEmailBanner />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function VerifyEmailBanner() {
  // Verification gates nothing (F1): a nudge for unverified users, nothing
  // more. Dismissal is per page-load state — it comes back on reload, which
  // is the right amount of persistent for a nudge.
  const me = useQuery(meOptions())
  const [dismissed, setDismissed] = useState(false)
  const resend = useMutation(requestEmailVerificationMutation())

  if (dismissed || !me.data || me.data.email_verified) return null

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b bg-muted px-6 py-2 text-sm"
    >
      <span>
        {resend.isSuccess
          ? 'Sent — check your inbox for a fresh link.'
          : `Verify your email — we sent a confirmation link to ${me.data.email}.`}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={resend.isPending}
          onClick={() => resend.mutate({})}
        >
          Resend
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </span>
    </div>
  )
}
