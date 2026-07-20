import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'

/** Link reported a failure (as opposed to the user just closing it). */
export class PlaidExitError extends Error {}

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

  return useCallback(
    (linkToken: string) =>
      new Promise<string | null>((resolve, reject) => {
        pending.current = { resolve, reject }
        setToken(linkToken)
      }),
    [],
  )
}
