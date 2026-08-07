import { createFileRoute, redirect } from '@tanstack/react-router'
import type { NetWorthRange } from '@/lib/net-worth'

// F10 CP2 (#88): the Net Worth page is absorbed into Accounts. The route
// stays only as a permanent redirect so old bookmarks and muscle memory keep
// working — a saved range deep-link carries over to the Accounts tab.
export const Route = createFileRoute('/net-worth')({
  validateSearch: (raw: Record<string, unknown>): { range?: NetWorthRange } => {
    const range = raw.range
    return range === '1m' || range === '6m' || range === '1y' || range === 'all'
      ? { range }
      : {}
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/accounts', search, replace: true })
  },
})
