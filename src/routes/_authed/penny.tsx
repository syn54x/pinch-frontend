import { useChat } from '@ai-sdk/react'
import { createFileRoute } from '@tanstack/react-router'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'
import { useState } from 'react'
import { API_BASE_URL, pennyChatFetch } from '@/api/client'
import { uuid7 } from '@/lib/uuid7'

export const Route = createFileRoute('/_authed/penny')({
  staticData: { title: 'Penny' },
  component: PennyScreen,
})

// CP0 skeleton (issue #46): the wire made visible, nothing more — the s22
// screen replaces this rendering in CP1. What is already permanent here is
// the transport (ADR-0001): only the newest message goes up (server history
// is authoritative), and once every approval in a turn is answered the SDK
// resubmits the verdicts by itself — the backend rejects partial verdicts.
function PennyScreen() {
  const [conversationId] = useState(uuid7)
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE_URL}/api/v1/penny/chat`,
        fetch: pennyChatFetch,
        prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
          body: { trigger, id, messages: messages.slice(-1) },
        }),
      }),
  )
  const { messages, sendMessage, addToolApprovalResponse, status, error } =
    useChat({
      id: conversationId,
      transport,
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    })
  const [draft, setDraft] = useState('')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <ol className="flex flex-col gap-3">
        {messages.map((message) => (
          <li key={message.id} data-role={message.role}>
            {message.parts.map((part, index) => (
              <MessagePart
                // biome-ignore lint/suspicious/noArrayIndexKey: parts carry no ids and never reorder within a message
                key={index}
                part={part}
                role={message.role}
                onApproval={addToolApprovalResponse}
              />
            ))}
          </li>
        ))}
      </ol>
      {error ? (
        <p data-testid="chat-error" className="text-destructive text-sm">
          {error.message}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const text = draft.trim()
          if (!text || status === 'streaming' || status === 'submitted') return
          setDraft('')
          void sendMessage({ text })
        }}
      >
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Ask Penny anything about your money…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </div>
  )
}

// The stream names tools the client never declared, so tool parts arrive
// either as `tool-<name>` or as `dynamic-tool` — normalize both to one
// structural shape before rendering.
type ToolShape = {
  toolName: string
  toolCallId: string
  state: string
  approval?: { id: string }
}

function asToolPart(part: { type: string }): ToolShape | null {
  if (part.type === 'dynamic-tool') return part as unknown as ToolShape
  if (part.type.startsWith('tool-')) {
    const raw = part as unknown as Omit<ToolShape, 'toolName'>
    return { ...raw, toolName: part.type.slice('tool-'.length) }
  }
  return null
}

function MessagePart({
  part,
  role,
  onApproval,
}: {
  part: { type: string }
  role: string
  onApproval: (response: { id: string; approved: boolean }) => void
}) {
  if (part.type === 'text') {
    return (
      <p
        data-testid={role === 'assistant' ? 'assistant-text' : 'user-text'}
        className="text-sm whitespace-pre-wrap"
      >
        {(part as { type: string; text: string }).text}
      </p>
    )
  }
  const tool = asToolPart(part)
  if (!tool) return null
  const approval = tool.approval
  return (
    <div
      data-testid="tool-part"
      data-tool={tool.toolName}
      data-state={tool.state}
      className="text-muted-foreground text-xs"
    >
      <span>
        {tool.toolName} · {tool.state}
      </span>
      {tool.state === 'approval-requested' && approval ? (
        <span data-testid="approval-requested" className="ml-2">
          <button
            type="button"
            data-testid={`approve-${tool.toolName}`}
            className="mr-1 underline"
            onClick={() => onApproval({ id: approval.id, approved: true })}
          >
            Approve
          </button>
          <button
            type="button"
            data-testid={`deny-${tool.toolName}`}
            className="underline"
            onClick={() => onApproval({ id: approval.id, approved: false })}
          >
            Deny
          </button>
        </span>
      ) : null}
    </div>
  )
}
