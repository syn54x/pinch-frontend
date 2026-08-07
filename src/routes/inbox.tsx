import { createFileRoute, redirect } from '@tanstack/react-router'

// F10 CP1 (ADR 0002): the Inbox is retired — review is a filter on the
// Register, not a place. The route stays only as a permanent redirect so
// old bookmarks and muscle memory land on the queue's new address.
export const Route = createFileRoute('/inbox')({
  beforeLoad: () => {
    throw redirect({
      to: '/register',
      search: { view: 'review' },
      replace: true,
    })
  },
})
