import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { errorDetail } from '@/api/client'
import { signupMutation } from '@/api/generated/@tanstack/react-query.gen'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const router = useRouter()
  const { queryClient } = Route.useRouteContext()
  const signup = useMutation({
    ...signupMutation(),
    onSuccess: () => {
      // Signup responds with a live session; land in the app straight away
      // (unverified — the shell's banner takes it from here).
      queryClient.clear()
      router.history.push('/accounts')
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    signup.mutate({
      body: {
        email: String(form.get('email')),
        password: String(form.get('password')),
      },
    })
  }

  return (
    <AuthShell title="Create your Pinch account">
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
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {signup.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorDetail(signup.error)}
          </p>
        )}
        <Button type="submit" disabled={signup.isPending}>
          Create account
        </Button>
        <p className="text-center text-muted-foreground text-sm">
          Have an account?{' '}
          <Link to="/login" className="underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
