import { ConnectExitError } from './connect-errors'

// The MX half of the connect boundary (F8 CP1): only this module (and its
// sheet in components/connect) speaks MX's postMessage shapes. Everything
// here rides the REAL captured event stream from the backend CP0 spike
// (pinch-backend docs/research/mx-platform-api.md, CP0 findings):
//
//   - postMessage is IFRAME-ONLY — the widget URL must render embedded,
//     never top-level (top-level captures zero events).
//   - Envelope: {mx: true, type: "mx/...", metadata: {...}}.
//   - Status events carry a NUMERIC connection_status (0=CREATED,
//     6=CONNECTED by enum position), not the string enum.
//   - memberConnected fires AFTER aggregation completes (~14s in
//     sandbox) — the sheet owes the user a working state that long.

/** The MX widget reported a failure (vs the user closing the sheet). */
export class MxExitError extends ConnectExitError {}

/** What a widget message means to the sheet: the success terminal, a
 * keep-waiting signal, a failure, or nothing at all (pings, other
 * frames' chatter). */
export type MxSignal =
  | { kind: 'connected'; memberGuid: string }
  | { kind: 'working' }
  | { kind: 'error'; message: string }

type MxEnvelope = {
  mx?: unknown
  type?: unknown
  metadata?: Record<string, unknown>
}

/** Interpret one postMessage payload from the iframed widget. String
 * payloads are parsed as the same JSON envelope; anything that isn't
 * MX's shape is null (ignored) — the window hears every frame's mail. */
export function interpretMxMessage(data: unknown): MxSignal | null {
  let envelope: MxEnvelope
  if (typeof data === 'string') {
    try {
      envelope = JSON.parse(data) as MxEnvelope
    } catch {
      return null
    }
  } else if (typeof data === 'object' && data !== null) {
    envelope = data as MxEnvelope
  } else {
    return null
  }
  if (envelope.mx !== true || typeof envelope.type !== 'string') return null

  switch (envelope.type) {
    case 'mx/connect/memberConnected': {
      const memberGuid = envelope.metadata?.member_guid
      // A guidless success can't complete the connect — keep waiting
      // rather than inventing an outcome.
      return typeof memberGuid === 'string'
        ? { kind: 'connected', memberGuid }
        : null
    }
    // The widget owns credential retries (DENIED/CHALLENGED play out in
    // its own UI), so status updates and the connecting step only ever
    // mean "still going" out here.
    case 'mx/connect/memberStatusUpdate':
      return { kind: 'working' }
    case 'mx/connect/stepChange':
      return envelope.metadata?.current === 'connecting'
        ? { kind: 'working' }
        : null
    case 'mx/connect/createMemberError':
    case 'mx/connect/oauthError':
      return { kind: 'error', message: 'MX could not connect this bank' }
    default:
      return null
  }
}
