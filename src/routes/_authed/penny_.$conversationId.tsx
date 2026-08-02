import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { UIMessage } from 'ai'
import { statusOf } from '@/api/client'
import { getConversationOptions } from '@/api/generated/@tanstack/react-query.gen'
import { PennyScreen } from '@/components/penny/screen'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { peekPennyChat, pennyChat } from '@/lib/penny-chats'

export const Route = createFileRoute('/_authed/penny_/$conversationId')({
  staticData: { title: 'Penny', fullBleed: true },
  component: PennyConversation,
})

// A Conversation by URL. Two ways in: the live handoff from /penny (the
// registry already holds the streaming Chat — no fetch, no interruption),
// or a cold load, where the stored messages arrive from the server already
// in UI-message form (the backend renders them for exactly this reload).
function PennyConversation() {
  const { conversationId } = Route.useParams()
  const live = peekPennyChat(conversationId)
  if (live) return <PennyScreen chat={live} />
  return <HydratedConversation conversationId={conversationId} />
}

function HydratedConversation({ conversationId }: { conversationId: string }) {
  const query = useQuery(
    getConversationOptions({ path: { conversation_id: conversationId } }),
  )

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3 px-[22px] py-[18px]">
        <Skeleton className="h-10 w-2/5 self-end rounded-xl" />
        <Skeleton className="h-16 w-3/5 rounded-xl" />
      </div>
    )
  }
  if (query.isError) {
    // Uniform 404 (another Ledger's Conversation, or deleted): a clean
    // dead end, never a crash.
    if (statusOf(query.error) === 404) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-semibold text-sm">
            This conversation doesn't exist
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/penny">Start a new chat</Link>
          </Button>
        </div>
      )
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Couldn't load this conversation.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  // Get-or-create is idempotent, so hydrating during render is safe under
  // StrictMode's double-invoke; the messages only seed a brand-new instance.
  const chat = pennyChat(
    conversationId,
    query.data.messages as unknown as UIMessage[],
  )
  return <PennyScreen chat={chat} />
}
