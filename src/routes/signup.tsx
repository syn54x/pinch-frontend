import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { signupMutation } from '@/api/generated/@tanstack/react-query.gen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function errorDetail(error: unknown): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    return String((error as { detail: unknown }).detail)
  }
  return 'Something went wrong — please try again.'
}

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
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your Pinch account</CardTitle>
        </CardHeader>
        <CardContent>
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
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
