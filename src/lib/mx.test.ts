import { describe, expect, it } from 'vitest'
import { ConnectExitError } from './connect-errors'
import { interpretMxMessage, MxExitError } from './mx'

// Event shapes below are the REAL captured sequence from the backend CP0
// spike (pinch-backend docs/research/mx-platform-api.md, CP0 findings):
// envelope {mx: true, type: "mx/...", metadata: {...}}, iframe-only,
// numeric connection_status (0=CREATED, 6=CONNECTED by enum position).

describe('interpretMxMessage', () => {
  it('resolves memberConnected to the member guid', () => {
    expect(
      interpretMxMessage({
        mx: true,
        type: 'mx/connect/memberConnected',
        metadata: {
          session_guid: 'SES-1',
          user_guid: 'USR-1',
          member_guid: 'MBR-1',
        },
      }),
    ).toEqual({ kind: 'connected', memberGuid: 'MBR-1' })
  })

  it('reads the connecting step as working — memberConnected is ~14s away', () => {
    expect(
      interpretMxMessage({
        mx: true,
        type: 'mx/connect/stepChange',
        metadata: { previous: 'enterCreds', current: 'connecting' },
      }),
    ).toEqual({ kind: 'working' })
  })

  it('reads a numeric memberStatusUpdate as working, whatever the status', () => {
    // The widget owns credential retries (DENIED/CHALLENGED play out inside
    // its own UI) — status updates only mean "still going" to the sheet.
    for (const status of [0, 2, 3, 6]) {
      expect(
        interpretMxMessage({
          mx: true,
          type: 'mx/connect/memberStatusUpdate',
          metadata: { member_guid: 'MBR-1', connection_status: status },
        }),
      ).toEqual({ kind: 'working' })
    }
  })

  it('maps createMemberError and oauthError to the error outcome', () => {
    for (const type of [
      'mx/connect/createMemberError',
      'mx/connect/oauthError',
    ]) {
      expect(interpretMxMessage({ mx: true, type, metadata: {} })).toEqual({
        kind: 'error',
        message: 'MX could not connect this bank',
      })
    }
  })

  it('parses a string payload as the same envelope', () => {
    expect(
      interpretMxMessage(
        JSON.stringify({
          mx: true,
          type: 'mx/connect/memberConnected',
          metadata: { member_guid: 'MBR-2' },
        }),
      ),
    ).toEqual({ kind: 'connected', memberGuid: 'MBR-2' })
  })

  it('ignores pings, non-MX messages, junk, and a guidless memberConnected', () => {
    expect(interpretMxMessage({ mx: true, type: 'mx/ping' })).toBeNull()
    expect(interpretMxMessage({ source: 'react-devtools' })).toBeNull()
    expect(interpretMxMessage('not json')).toBeNull()
    expect(interpretMxMessage(null)).toBeNull()
    expect(interpretMxMessage(42)).toBeNull()
    expect(
      interpretMxMessage({
        mx: true,
        type: 'mx/connect/memberConnected',
        metadata: {},
      }),
    ).toBeNull()
  })
})

describe('MxExitError', () => {
  it('is a ConnectExitError — call sites widen one instanceof', () => {
    expect(new MxExitError('boom')).toBeInstanceOf(ConnectExitError)
  })
})
