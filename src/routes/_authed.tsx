import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { isUnauthorized } from '@/api/client'
import { meOptions } from '@/api/generated/@tanstack/react-query.gen'
import { AppShell } from '@/components/app-shell'
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

// Every authed surface mounts inside the persistent App shell (F3 CP0).
function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
