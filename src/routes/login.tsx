import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { errorDetail } from '@/api/client'
import { loginMutation } from '@/api/generated/@tanstack/react-query.gen'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LoginSearch = {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { queryClient } = Route.useRouteContext()
  const { redirect } = Route.useSearch()
  const login = useMutation({
    ...loginMutation(),
    onSuccess: () => {
      // The guard's /me probe may hold a cached 401 — drop it so the
      // destination's beforeLoad re-asks the server.
      queryClient.clear()
      router.history.push(redirect ?? '/accounts')
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    login.mutate({
      body: {
        email: String(form.get('email')),
        password: String(form.get('password')),
      },
    })
  }

  return (
    <AuthShell title="Log in to Pinch">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {login.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorDetail(login.error)}
          </p>
        )}
        <Button type="submit" disabled={login.isPending}>
          Log in
        </Button>
        <p className="text-center text-muted-foreground text-sm">
          No account?{' '}
          <Link to="/signup" className="underline">
            Sign up
          </Link>
          {' · '}
          <Link to="/reset-password" className="underline">
            Forgot password?
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
