import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import {
  confirmPasswordResetMutation,
  requestPasswordResetMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  EmailField,
  MutationError,
  PasswordField,
} from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

type ResetSearch = {
  token?: string
}

// Both halves of password recovery in one route, switched on the presence
// of ?token: the request form (mirroring the backend's enumeration-safe
// always-202) and the confirm form the emailed link lands on.
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()

  return (
    <AuthShell title="Reset your password">
      {token ? <ConfirmForm token={token} /> : <RequestForm />}
    </AuthShell>
  )
}

function RequestForm() {
  const request = useMutation(requestPasswordResetMutation())

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    request.mutate({ body: { email: String(form.get('email')) } })
  }

  if (request.isSuccess) {
    // Same affordance whether or not the email exists — the backend never
    // says, and neither do we.
    return (
      <div className="grid gap-4 text-sm">
        <p>
          If that email has a Pinch account, a reset link is on its way. Check
          your inbox.
        </p>
        <Link to="/login" className="underline">
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <EmailField />
      <MutationError mutation={request} />
      <Button type="submit" disabled={request.isPending}>
        Send reset link
      </Button>
      <p className="text-center text-muted-foreground text-sm">
        Remembered it?{' '}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  )
}

function ConfirmForm({ token }: { token: string }) {
  const router = useRouter()
  const confirm = useMutation({
    ...confirmPasswordResetMutation(),
    onSuccess: () => router.history.push('/login'),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    confirm.mutate({
      body: { token, password: String(form.get('password')) },
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <PasswordField label="New password" autoComplete="new-password" />
      <MutationError mutation={confirm} />
      <Button type="submit" disabled={confirm.isPending}>
        Set new password
      </Button>
    </form>
  )
}
