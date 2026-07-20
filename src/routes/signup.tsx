import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { signupMutation } from '@/api/generated/@tanstack/react-query.gen'
import {
  EmailField,
  MutationError,
  PasswordField,
} from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

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
        <EmailField />
        <PasswordField autoComplete="new-password" />
        <MutationError mutation={signup} />
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
