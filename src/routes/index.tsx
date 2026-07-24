import { createFileRoute, redirect } from '@tanstack/react-router'

// Opening Pinch lands on the Dashboard (F5 CP5): net worth, what's due, and
// what needs review — the look-ahead story, before the daily queue.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})
