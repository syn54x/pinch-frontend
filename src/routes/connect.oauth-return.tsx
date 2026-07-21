import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { errorDetail } from '@/api/client'
import { createConnection, refreshConnection } from '@/api/generated'
import { AuthShell } from '@/components/auth-shell'
import {
  clearOAuthState,
  PlaidExitError,
  readOAuthState,
  resumeOAuthLink,
} from '@/lib/plaid'

// The bank's OAuth redirect lands here. The link token was stashed before
// the widget opened; re-initialize Link with it plus this exact URL, then
// resume the same path a non-OAuth success takes (exchange, or repair's
// follow-up sync). Missing or stale state gets an honest expired screen —
// never a silent retry (a fresh connect on a broken attempt can duplicate).
export const Route = createFileRoute('/connect/oauth-return')({
  component: OAuthReturnPage,
})

// StrictMode double-mounts; the resume must fire exactly once per token.
const startedTokens = new Set<string>()

type Phase = 'resuming' | 'expired' | 'failed'

function OAuthReturnPage() {
  const router = useRouter()
  const [state] = useState(readOAuthState)
  const [phase, setPhase] = useState<Phase>(state ? 'resuming' : 'expired')
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    if (!state || startedTokens.has(state.linkToken)) return
    startedTokens.add(state.linkToken)
    ;(async () => {
      try {
        const publicToken = await resumeOAuthLink(state, window.location.href)
        if (publicToken === null) {
          // Dismissed mid-OAuth: treat like any widget close — silence.
          clearOAuthState()
          router.history.push('/connections')
          return
        }
        let watchId: string
        if (state.connectionId) {
          // Repair mode: no exchange; the follow-up sync proves the fix.
          await refreshConnection({
            path: { connection_id: state.connectionId },
            throwOnError: true,
          })
          watchId = state.connectionId
        } else {
          const { data: connection } = await createConnection({
            body: { public_token: publicToken },
            throwOnError: true,
          })
          watchId = connection.id
        }
        clearOAuthState()
        router.navigate({ to: '/connections', search: { watch: watchId } })
      } catch (caught) {
        startedTokens.delete(state.linkToken)
        clearOAuthState()
        setDetail(
          caught instanceof PlaidExitError
            ? caught.message
            : errorDetail(caught),
        )
        setPhase('failed')
      }
    })()
  }, [state, router])

  return (
    <AuthShell title="Finishing your bank connection">
      {phase === 'resuming' ? (
        <p className="text-sm">Completing the connection with your bank…</p>
      ) : (
        <div className="grid gap-4 text-sm">
          <p>
            {phase === 'expired'
              ? 'This connect attempt expired — bank logins can only be finished in the tab and session that started them. Start again from Connections.'
              : `The connection couldn't be completed: ${detail}`}
          </p>
          <Link to="/connections" className="underline">
            Start again from Connections
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
