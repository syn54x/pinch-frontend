import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'

/** Link reported a failure (as opposed to the user just closing it). */
export class PlaidExitError extends Error {}

// --- OAuth redirect persistence -----------------------------------------
// OAuth institutions leave the page entirely; the link token must survive
// the round-trip. sessionStorage is a DOCUMENTED exception to the
// no-auth-state-in-storage law (PRD #8): link tokens are short-lived and
// single-purpose — nothing durable, nothing session-granting.

const OAUTH_STORAGE_KEY = 'pinch.plaid-oauth'

export type OAuthResumeState = {
  linkToken: string
  /** Present for repair-mode attempts; absent means create-mode. */
  connectionId?: string
}

function stashOAuthState(state: OAuthResumeState): void {
  sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(state))
}

export function readOAuthState(): OAuthResumeState | null {
  const raw = sessionStorage.getItem(OAUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as OAuthResumeState
    return typeof parsed.linkToken === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function clearOAuthState(): void {
  sessionStorage.removeItem(OAUTH_STORAGE_KEY)
}

// --- imperative resume for the return route ------------------------------
// The return route auto-fires on mount; hook lifecycles don't survive
// StrictMode's double-mount for auto-fired flows (the verify-email lesson),
// so the resume drives Plaid's script contract directly — the same contract
// the e2e fixture implements.

const PLAID_SCRIPT_URL =
  'https://cdn.plaid.com/link/v2/stable/link-initialize.js'

type PlaidGlobal = {
  create(config: {
    token: string
    receivedRedirectUri?: string
    onSuccess: (publicToken: string) => void
    onExit: (
      error: { display_message?: string; error_code?: string } | null,
    ) => void
  }): { open(): void; destroy(): void }
}

async function ensurePlaidScript(): Promise<PlaidGlobal> {
  const existing = (window as { Plaid?: PlaidGlobal }).Plaid
  if (existing) return existing
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PLAID_SCRIPT_URL
    script.onload = () => resolve()
    script.onerror = () => reject(new PlaidExitError('Plaid failed to load'))
    document.head.appendChild(script)
  })
  const loaded = (window as { Plaid?: PlaidGlobal }).Plaid
  if (!loaded) throw new PlaidExitError('Plaid failed to load')
  return loaded
}

/** Re-initialize Link after the bank's OAuth redirect. Same settlement
 * contract as usePlaidConnect: public token | null (dismissed) | throws. */
export async function resumeOAuthLink(
  state: OAuthResumeState,
  receivedRedirectUri: string,
): Promise<string | null> {
  const plaid = await ensurePlaidScript()
  return new Promise<string | null>((resolve, reject) => {
    const handler = plaid.create({
      token: state.linkToken,
      receivedRedirectUri,
      onSuccess: (publicToken) => resolve(publicToken),
      onExit: (error) => {
        if (error) {
          reject(
            new PlaidExitError(
              error.display_message ?? error.error_code ?? 'Plaid exit',
            ),
          )
        } else {
          resolve(null)
        }
      },
    })
    handler.open()
  })
}

/** One imperative connect() over react-plaid-link's config-at-render hook:
 * resolves with the public token on success, null when the user dismisses
 * the widget, rejects with PlaidExitError when Link reports an error.
 * Exists purely as code organization — the UI (and nothing else) speaks
 * Plaid's shapes through this boundary. */
export function usePlaidConnect(): (
  linkToken: string,
) => Promise<string | null> {
  const [token, setToken] = useState<string | null>(null)
  const pending = useRef<{
    resolve: (value: string | null) => void
    reject: (error: Error) => void
  } | null>(null)

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (publicToken) => {
      pending.current?.resolve(publicToken)
      pending.current = null
      setToken(null)
    },
    onExit: (error) => {
      if (error) {
        pending.current?.reject(
          new PlaidExitError(error.display_message ?? error.error_code),
        )
      } else {
        pending.current?.resolve(null)
      }
      pending.current = null
      setToken(null)
    },
  })

  // The hook wants its token at render; open fires once the script's ready.
  useEffect(() => {
    if (token && ready) open()
  }, [token, ready, open])

  // If the script never loads (ready never flips), fail the attempt rather
  // than hanging the caller's busy state forever.
  useEffect(() => {
    if (!token || ready) return
    const timer = setTimeout(() => {
      pending.current?.reject(new PlaidExitError('Plaid took too long to load'))
      pending.current = null
      setToken(null)
    }, 20_000)
    return () => clearTimeout(timer)
  }, [token, ready])

  return useCallback(
    (linkToken: string, options?: { connectionId?: string }) =>
      new Promise<string | null>((resolve, reject) => {
        if (pending.current) {
          // Never clobber an in-flight attempt — its promise would hang.
          reject(new PlaidExitError('A connect attempt is already in progress'))
          return
        }
        // Stash before open: if the widget goes OAuth, the page is gone.
        stashOAuthState({ linkToken, connectionId: options?.connectionId })
        pending.current = {
          resolve: (value) => {
            clearOAuthState()
            resolve(value)
          },
          reject: (error) => {
            clearOAuthState()
            reject(error)
          },
        }
        setToken(linkToken)
      }),
    [],
  )
}
