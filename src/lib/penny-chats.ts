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

export function pennyChat(
  id: string,
  messages: UIMessage[] = [],
): Chat<UIMessage> {
  const existing = live.get(id)
  if (existing) return existing
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
}
