import { createFileRoute } from '@tanstack/react-router'
import { Inbox as InboxIcon } from 'lucide-react'

export const Route = createFileRoute('/_authed/inbox')({
  staticData: { title: 'Inbox' },
  component: InboxPage,
})

// F3 CP0: the Inbox mounts with its designed empty state — an empty state
// that teaches the surface, never a blank. The review queue itself (day
// groups, proposals, keyboard verbs) arrives in CP1 on wireframe #7.
function InboxPage() {
  return (
    <div
      data-testid="inbox-empty"
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <InboxIcon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 font-medium">Nothing to review</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        When transactions sync in, their category proposals queue here for a
        quick review pass — accept or correct, one at a time or all at once.
      </p>
    </div>
  )
}
