import type { UIMessage } from 'ai'
import { Markdown } from '@/components/penny/markdown'
import { ToolChip } from '@/components/penny/tool-chip'
import { asToolPart } from '@/lib/penny'
import { isStaleApproval } from '@/lib/penny-chats'

// The conversation column (wireframe s22): user turns are right-aligned
// bubbles on the selection surface; assistant turns are the 24px penny dot
// beside free-flowing content — prose, tool chips, approval controls.
export function Thread({
  chatId,
  messages,
  onApproval,
}: {
  chatId: string
  messages: UIMessage[]
  onApproval: (response: { id: string; approved: boolean }) => void
}) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserTurn key={message.id} message={message} />
        ) : (
          <AssistantTurn
            key={message.id}
            chatId={chatId}
            message={message}
            onApproval={onApproval}
          />
        ),
      )}
    </ol>
  )
}

function UserTurn({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text)
    .join('\n')
  if (!text) return null
  return (
    <li className="max-w-[70%] self-end rounded-xl bg-accent px-[13px] py-2.5">
      <p data-testid="user-text" className="whitespace-pre-wrap text-[12.5px]">
        {text}
      </p>
    </li>
  )
}

function AssistantTurn({
  chatId,
  message,
  onApproval,
}: {
  chatId: string
  message: UIMessage
  onApproval: (response: { id: string; approved: boolean }) => void
}) {
  return (
    <li className="flex max-w-[82%] gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 size-6 shrink-0 rounded-full bg-penny"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            const { text } = part as { text: string }
            // biome-ignore lint/suspicious/noArrayIndexKey: parts carry no ids and never reorder within a message
            return text ? <Markdown key={index}>{text}</Markdown> : null
          }
          const tool = asToolPart(part)
          if (!tool) return null
          return (
            <ToolChip
              key={tool.toolCallId}
              part={tool}
              onApproval={onApproval}
              expired={isStaleApproval(chatId, tool.toolCallId)}
            />
          )
        })}
      </div>
    </li>
  )
}
