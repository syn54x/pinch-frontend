import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  deleteConversationMutation,
  listConversationsInfiniteOptions,
  listConversationsQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { dropPennyChat } from '@/lib/penny-chats'
import { relativeTime } from '@/lib/time'

// The Penny screen's top-bar verbs (wireframe s22): New chat and History.
// History is a popover — not a route, not a sidebar — listing Conversations
// newest-first (title = first user message), cursor-paginated. Delete is
// destructive and irreversible, so it sits behind an alert-dialog; deleting
// the Conversation currently open lands on a fresh chat.
export function PennyChips() {
  return (
    <span className="flex items-center gap-2">
      <Link
        to="/penny"
        className="flex h-[26px] items-center rounded-full border bg-card px-[9px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        New chat
      </Link>
      <History />
    </span>
  )
}

function History() {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-[26px] items-center rounded-full border bg-card px-[9px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground">
        History
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5">
        <HistoryList onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function HistoryList({ onNavigate }: { onNavigate: () => void }) {
  // The generated options carry the fetcher but not the cursor semantics —
  // those are the backend's Page contract: next_cursor, null when done. The
  // first page is an empty page-object (an object pageParam passes through
  // verbatim), NOT null — a bare null would serialize as ?cursor=null.
  const query = useInfiniteQuery({
    ...listConversationsInfiniteOptions(),
    initialPageParam: {},
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentId = useRouterState({
    select: (state) => state.location.pathname.match(/^\/penny\/(.+)$/)?.[1],
  })
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    title: string
  } | null>(null)
  const deleteConversation = useMutation({
    ...deleteConversationMutation(),
    onSuccess: (_, variables) => {
      const id = variables.path.conversation_id
      dropPennyChat(id)
      void queryClient.invalidateQueries({
        queryKey: listConversationsQueryKey(),
      })
      // Deleting the open Conversation can't leave a dead thread on screen.
      if (id === currentId) void navigate({ to: '/penny', replace: true })
    },
  })

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-1 p-1">
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <p className="p-3 text-[12.5px] text-muted-foreground">
        Couldn't load history.
      </p>
    )
  }

  const conversations = query.data.pages.flatMap((page) => page.items)
  if (conversations.length === 0) {
    return (
      <p className="p-3 text-[12.5px] text-muted-foreground">
        No conversations yet.
      </p>
    )
  }

  return (
    <>
      <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="group relative">
            <button
              type="button"
              data-testid="history-row"
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => {
                onNavigate()
                void navigate({
                  to: '/penny/$conversationId',
                  params: { conversationId: conversation.id },
                })
              }}
            >
              <span className="w-full truncate pr-7 text-[12.5px]">
                {conversation.title ?? 'Untitled'}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {relativeTime(conversation.updated_at)}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete conversation: ${conversation.title ?? 'Untitled'}`}
              className="absolute top-2 right-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() =>
                setPendingDelete({
                  id: conversation.id,
                  title: conversation.title ?? 'Untitled',
                })
              }
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Older conversations'}
        </Button>
      ) : null}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" will be gone for good — there's no undo.
              Nothing Penny did to your ledger is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  deleteConversation.mutate({
                    path: { conversation_id: pendingDelete.id },
                  })
                }
                setPendingDelete(null)
              }}
            >
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
