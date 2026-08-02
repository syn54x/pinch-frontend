import type { Chat } from '@ai-sdk/react'
import { useChat } from '@ai-sdk/react'
import { useQuery } from '@tanstack/react-query'
import type { UIMessage } from 'ai'
import { useEffect, useRef } from 'react'
import { pennyStatusOptions } from '@/api/generated/@tanstack/react-query.gen'
import { Composer } from '@/components/penny/composer'
import { Thread } from '@/components/penny/thread'
import { Button } from '@/components/ui/button'

// The Penny screen (CONTEXT.md; wireframe s22): one Conversation, a
// scrolling thread, the composer. Present even when Penny isn't configured
// — the screen explains rather than the nav hiding her (PRD #45 decision).
export function PennyScreen({
  chat,
  onFirstSend,
}: {
  chat: Chat<UIMessage>
  onFirstSend?: () => void
}) {
  const {
    messages,
    status,
    error,
    sendMessage,
    addToolApprovalResponse,
    regenerate,
  } = useChat({ chat })
  const statusQuery = useQuery(pennyStatusOptions())
  const scroller = useRef<HTMLDivElement>(null)

  // Follow the stream: pinned to the newest turn as content arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll reacts to conversation growth
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages])

  if (statusQuery.data && !statusQuery.data.available) {
    return <PennyUnavailable reason={statusQuery.data.reason ?? null} />
  }

  const busy = status === 'streaming' || status === 'submitted'
  const send = (text: string) => {
    const isFirst = messages.length === 0
    void sendMessage({ text })
    if (isFirst) onFirstSend?.()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="flex-1 overflow-y-auto px-[22px] py-[18px]"
      >
        <Thread messages={messages} onApproval={addToolApprovalResponse} />
        {status === 'submitted' ? (
          <div role="status" className="mt-4 flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-6 animate-pulse rounded-full bg-penny"
            />
            <span className="text-[12.5px] text-muted-foreground">
              <span aria-hidden>…</span>
              <span className="sr-only">Penny is thinking</span>
            </span>
          </div>
        ) : null}
      </div>
      {error ? (
        <div
          data-testid="chat-error"
          className="mx-[22px] mb-2 flex items-center gap-3 rounded-md border border-destructive/40 px-3 py-2"
        >
          <p className="min-w-0 flex-1 text-[12.5px] text-destructive">
            Penny hit a snag: {error.message}
          </p>
          <Button size="sm" variant="outline" onClick={() => void regenerate()}>
            Try again
          </Button>
        </div>
      ) : null}
      <Composer
        onSend={send}
        disabled={!statusQuery.data?.available}
        busy={busy}
        showSuggestions={messages.length === 0}
      />
    </div>
  )
}

function PennyUnavailable({ reason }: { reason: string | null }) {
  return (
    <div
      data-testid="penny-unavailable"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <span
        aria-hidden
        className="size-[22px] rounded-full bg-penny opacity-50"
      />
      <p className="font-semibold text-sm">
        Penny isn't configured on this server
      </p>
      {reason ? (
        <p className="max-w-md text-muted-foreground text-xs">{reason}</p>
      ) : null}
    </div>
  )
}
