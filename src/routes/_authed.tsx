import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { isUnauthorized } from '@/api/client'
import {
  logoutMutation,
  meOptions,
} from '@/api/generated/@tanstack/react-query.gen'
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
})

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
        <span className="font-semibold">Pinch</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={logout.isPending}
          onClick={() => logout.mutate({})}
        >
          Log out
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
