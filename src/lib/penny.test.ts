import { describe, expect, it } from 'vitest'
import conversationRaw from '../../e2e/fixtures/penny/conversation-ui-messages.json?raw'
import {
  asToolPart,
  SUGGESTIONS,
  toolDetail,
  toolLabel,
  toolStatus,
} from './penny'

// The fixture is a real stored Conversation captured off the wire in CP0
// (e2e/fixtures/penny) — the reload contract this model must keep parsing.
const conversation = JSON.parse(conversationRaw) as {
  messages: Array<{ role: string; parts: Array<{ type: string }> }>
}

describe('asToolPart', () => {
  it('normalizes every tool part in a real stored conversation', () => {
    const toolParts = conversation.messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type.startsWith('tool-'))
    expect(toolParts.length).toBeGreaterThan(0)
    for (const part of toolParts) {
      const tool = asToolPart(part)
      expect(tool).not.toBeNull()
      expect(tool?.toolName).toMatch(/^[a-z_]+$/)
      expect(tool?.toolCallId).toBeTruthy()
      expect(tool?.state).toBeTruthy()
    }
  })

  it('ignores non-tool parts', () => {
    expect(asToolPart({ type: 'text' })).toBeNull()
    expect(asToolPart({ type: 'step-start' })).toBeNull()
  })

  it('reads dynamic-tool parts as-is', () => {
    const part = {
      type: 'dynamic-tool',
      toolName: 'spending_report',
      toolCallId: 'x',
      state: 'output-available',
    }
    expect(asToolPart(part)?.toolName).toBe('spending_report')
  })
})

describe('tool chip language', () => {
  it('speaks the ledger language for known tools', () => {
    expect(
      toolLabel({
        toolName: 'spending_report',
        toolCallId: 'x',
        state: 'output-available',
      }),
    ).toBe('Read your spending report')
  })

  it('degrades legibly for a tool this client never heard of', () => {
    expect(
      toolLabel({
        toolName: 'forecast_cashflow',
        toolCallId: 'x',
        state: 'output-available',
      }),
    ).toBe('forecast cashflow')
  })

  it('surfaces the one humanizing input detail', () => {
    expect(
      toolDetail({
        toolName: 'spending_report',
        toolCallId: 'x',
        state: 'output-available',
        input: { month: '2026-06' },
      }),
    ).toBe('2026-06')
    expect(
      toolDetail({
        toolName: 'list_accounts',
        toolCallId: 'x',
        state: 'output-available',
        input: {},
      }),
    ).toBeNull()
  })

  it('gives every non-settled state a status word', () => {
    const base = { toolName: 't', toolCallId: 'x' }
    expect(toolStatus({ ...base, state: 'input-streaming' })).toBe('working…')
    expect(toolStatus({ ...base, state: 'approval-requested' })).toBe(
      'needs your approval',
    )
    expect(toolStatus({ ...base, state: 'output-denied' })).toBe('not applied')
    expect(toolStatus({ ...base, state: 'output-available' })).toBeNull()
  })
})

describe('suggestions', () => {
  it('exactly three, all honest (no import/attach promises)', () => {
    expect(SUGGESTIONS).toHaveLength(3)
    for (const chip of SUGGESTIONS) {
      expect(chip.toLowerCase()).not.toContain('import')
      expect(chip.toLowerCase()).not.toContain('attach')
    }
  })
})
