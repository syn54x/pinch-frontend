import { createFileRoute, redirect } from '@tanstack/react-router'

// Opening Pinch drops the user into the daily loop: `/` redirects to the
// Inbox until a Dashboard exists (F5).
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/inbox' })
  },
})
