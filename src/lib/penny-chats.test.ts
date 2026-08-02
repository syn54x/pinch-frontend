import type { UIMessage } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The transport touches the network (DefaultChatTransport), which jsdom
// doesn't need to actually run for these tests — only construction and the
// seed-tracking side effect are under test.
vi.mock('@/api/client', () => ({
  API_BASE_URL: 'http://localhost:8100',
  pennyChatFetch: vi.fn(),
}))

const approvalRequestedPart = (toolCallId: string) => ({
  type: 'tool-create_category',
  toolCallId,
  state: 'approval-requested',
  input: { name: 'a' },
  approval: { id: toolCallId },
})

function seedMessage(parts: unknown[]): UIMessage {
  return { id: 'msg-1', role: 'assistant', parts } as UIMessage
}

describe('pennyChat / isStaleApproval', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('marks approval-requested parts present at construction as stale', async () => {
    const { pennyChat, isStaleApproval } = await import('./penny-chats')
    const id = 'conv-1'
    pennyChat(id, [seedMessage([approvalRequestedPart('call-a')])])
    expect(isStaleApproval(id, 'call-a')).toBe(true)
  })

  it('never marks a fresh, seedless Chat as having stale approvals', async () => {
    const { pennyChat, isStaleApproval } = await import('./penny-chats')
    const id = 'conv-2'
    pennyChat(id)
    expect(isStaleApproval(id, 'anything')).toBe(false)
  })

  it('does not stale-mark parts outside the seed, or in other states', async () => {
    const { pennyChat, isStaleApproval } = await import('./penny-chats')
    const id = 'conv-3'
    pennyChat(id, [
      seedMessage([
        { type: 'text', text: 'hi' },
        { ...approvalRequestedPart('call-b'), state: 'output-denied' },
      ]),
    ])
    expect(isStaleApproval(id, 'call-b')).toBe(false)
  })

  it('reuses the live instance on a second call — no re-seeding, no re-staling', async () => {
    const { pennyChat, isStaleApproval } = await import('./penny-chats')
    const id = 'conv-4'
    const first = pennyChat(id, [
      seedMessage([approvalRequestedPart('call-c')]),
    ])
    // A second call with DIFFERENT seed messages must be ignored — the
    // live instance (and its stale set) is already established.
    const second = pennyChat(id, [])
    expect(second).toBe(first)
    expect(isStaleApproval(id, 'call-c')).toBe(true)
  })

  it('drops the stale set along with the live instance on delete', async () => {
    const { pennyChat, dropPennyChat, isStaleApproval, peekPennyChat } =
      await import('./penny-chats')
    const id = 'conv-5'
    pennyChat(id, [seedMessage([approvalRequestedPart('call-d')])])
    dropPennyChat(id)
    expect(peekPennyChat(id)).toBeUndefined()
    expect(isStaleApproval(id, 'call-d')).toBe(false)
  })
})
