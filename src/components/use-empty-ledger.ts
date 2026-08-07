import { useQuery } from '@tanstack/react-query'
import {
  listAccountsOptions,
  listConnectionsOptions,
} from '@/api/generated/@tanstack/react-query.gen'

// The one derivation of "the ledger is empty": no accounts AND no
// connections — onboarding's stateless trigger (#20) and the review
// queue's route-back-to-connecting zero state read the same fact. False
// while either query is still loading: emptiness is asserted, never
// assumed. The accounts key matches the Register's (limit 100) so both
// read one cache entry.
export function useEmptyLedger(): boolean {
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const connections = useQuery(listConnectionsOptions())
  return (
    accounts.data !== undefined &&
    connections.data !== undefined &&
    accounts.data.items.length === 0 &&
    connections.data.items.length === 0
  )
}
