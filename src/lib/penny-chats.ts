import { Chat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import { API_BASE_URL, pennyChatFetch } from '@/api/client'

// One live Chat per Conversation id, module-level so the instance survives
// the /penny → /penny/$conversationId history.replace on first send — the
// stream keeps flowing across the route change. A Conversation not in this
// registry (a true reload) hydrates from GET /conversations/{id} and enters
// it here.

const live = new Map<string, Chat<UIMessage>>()

// Approvals a Chat was CONSTRUCTED with (cold hydration from GET
// /conversations/{id}) rather than ones it received live. The backend has
// no durable pending-approval queue (CONTEXT.md: Approval card) — an
// approval-requested part surviving into a fresh page load only exists
// because its turn ended without an answer, so it is expired by
// construction. A part added later, during THIS session's live stream, is
// never in this set and stays actionable. Reconstructing the Chat (a hard
// reload) rebuilds the set from the fresh seed; switching conversations via
// History reuses the live instance and never touches it.
const staleApprovals = new Map<string, ReadonlySet<string>>()

export function isStaleApproval(chatId: string, toolCallId: string): boolean {
  return staleApprovals.get(chatId)?.has(toolCallId) ?? false
}

export function pennyChat(
  id: string,
  messages: UIMessage[] = [],
): Chat<UIMessage> {
  const existing = live.get(id)
  if (existing) return existing
  if (messages.length > 0) {
    const stale = new Set<string>()
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type.startsWith('tool-') &&
          (part as { state?: string }).state === 'approval-requested'
        ) {
          stale.add((part as { toolCallId: string }).toolCallId)
        }
      }
    }
    if (stale.size > 0) staleApprovals.set(id, stale)
  }
  const chat = new Chat<UIMessage>({
    id,
    messages,
    transport: new DefaultChatTransport({
      api: `${API_BASE_URL}/api/v1/penny/chat`,
      fetch: pennyChatFetch,
      // Server history is authoritative: only the newest message goes up.
      prepareSendMessagesRequest: ({ id: chatId, messages: all, trigger }) => ({
        body: { trigger, id: chatId, messages: all.slice(-1) },
      }),
    }),
    // The backend rejects partial verdicts — every approval in a turn must
    // answer in one message. This resubmits exactly then (CP0 finding).
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })
  live.set(id, chat)
  return chat
}

export function peekPennyChat(id: string): Chat<UIMessage> | undefined {
  return live.get(id)
}

/** Forget a Conversation's live state (delete flows, CP3). */
export function dropPennyChat(id: string): void {
  live.delete(id)
  staleApprovals.delete(id)
}
