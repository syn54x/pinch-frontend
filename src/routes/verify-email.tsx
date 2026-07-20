import { createFileRoute, Link } from '@tanstack/react-router'
import { confirmEmailVerification } from '@/api/generated'
import { meQueryKey } from '@/api/generated/@tanstack/react-query.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type VerifySearch = {
  token?: string
}

// The landing for the emailed confirmation link: the loader consumes the
// token on arrival — one click in the mail, zero clicks here. Consumption
// lives in the loader (not an effect) because tokens are single-use: the
// loader runs exactly once per navigation, outside React's lifecycle, so
// StrictMode's double-mount can never consume-then-reject the same token.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ context, deps }): Promise<{ verified: boolean }> => {
    if (!deps.token) return { verified: false }
    try {
      await confirmEmailVerification({
        body: { token: deps.token },
        throwOnError: true,
      })
    } catch {
      return { verified: false }
    }
    // The banner reads /me — make it re-ask.
    await context.queryClient.invalidateQueries({ queryKey: meQueryKey() })
    return { verified: true }
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { verified } = Route.useLoaderData()

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {verified ? (
            <>
              <p>Email verified — you're all set.</p>
              <Link to="/accounts" className="underline">
                Go to Pinch
              </Link>
            </>
          ) : (
            <>
              <p>
                This verification link is invalid or has expired. Open Pinch and
                use the banner to resend a fresh one.
              </p>
              <Link to="/accounts" className="underline">
                Open Pinch
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
