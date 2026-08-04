import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { interpretMxMessage, MxExitError } from '@/lib/mx'

// MX Connect iframed in a Pinch-owned sheet (wireframe 7c): Pinch owns the
// header, the cancel, and the privacy line; the interior is MX's own UI.
// The iframe is load-bearing, not styling — MX's postMessage stream only
// fires into a real parent frame (backend CP0 spike, empirical), so the
// widget URL must never open top-level.
//
// Same three-outcome contract as usePlaidConnect: widget URL in →
// member guid on success, null when the user cancels or closes the
// sheet, MxExitError when the widget reports a failure.

export function useMxConnect(): {
  /** Open the sheet on a widget URL; settles per the connect contract. */
  connect: (widgetUrl: string) => Promise<string | null>
  /** The sheet element — render it near the caller (null while idle). */
  sheet: ReactNode
} {
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const pending = useRef<{
    resolve: (value: string | null) => void
    reject: (error: Error) => void
  } | null>(null)

  const settle = useCallback(
    (deliver: (attempt: NonNullable<typeof pending.current>) => void) => {
      const attempt = pending.current
      pending.current = null
      setWidgetUrl(null)
      setWorking(false)
      if (attempt) deliver(attempt)
    },
    [],
  )

  useEffect(() => {
    if (widgetUrl === null) return
    // Only the widget's own origin is trusted — the window hears every
    // frame's mail, and the e2e fake serves under this same origin.
    const widgetOrigin = new URL(widgetUrl).origin
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== widgetOrigin) return
      const signal = interpretMxMessage(event.data)
      if (signal === null) return
      if (signal.kind === 'working') {
        // memberConnected only fires after aggregation completes (~14s in
        // sandbox) — say "still going" out loud for the whole wait.
        setWorking(true)
      } else if (signal.kind === 'connected') {
        settle((attempt) => attempt.resolve(signal.memberGuid))
      } else {
        settle((attempt) => attempt.reject(new MxExitError(signal.message)))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [widgetUrl, settle])

  const connect = useCallback(
    (url: string) =>
      new Promise<string | null>((resolve, reject) => {
        if (pending.current) {
          // Never clobber an in-flight attempt — its promise would hang.
          reject(new MxExitError('A connect attempt is already in progress'))
          return
        }
        pending.current = { resolve, reject }
        setWorking(false)
        setWidgetUrl(url)
      }),
    [],
  )

  // Cancel, ✕, Escape, and the overlay are all the same dismissal: the
  // null outcome — never an error.
  const cancel = useCallback(
    () => settle((attempt) => attempt.resolve(null)),
    [settle],
  )

  const sheet =
    widgetUrl === null ? null : (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) cancel()
        }}
      >
        <SheetContent data-testid="mx-connect-sheet" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Connect your bank</SheetTitle>
            <SheetDescription>Step 2 of 2</SheetDescription>
          </SheetHeader>
          <iframe
            src={widgetUrl}
            title="MX Connect"
            className="min-h-0 w-full flex-1 rounded-lg border bg-background"
          />
          <SheetFooter>
            {working && (
              <p
                data-testid="mx-working"
                role="status"
                className="text-center text-muted-foreground text-sm"
              >
                Connecting to your bank — this can take a moment…
              </p>
            )}
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <p className="text-center text-muted-foreground text-xs">
              Pinch never sees your bank password.
            </p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )

  return { connect, sheet }
}
