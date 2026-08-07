import type { AccountOut } from '@/api/generated/types.gen'

// Global search v1 (F10 CP4): the top bar matches account names
// client-side — no search endpoint exists, and the accounts list is small
// enough to hold in hand. Pure so the matching is unit-tested.

/** Results cap: enough to disambiguate, few enough to stay a jump list. */
export const MAX_ACCOUNT_RESULTS = 8

type Matchable = Pick<AccountOut, 'label' | 'archived'>

/** Case-insensitive substring match on account labels. Archived accounts
 * never surface — search jumps to activity, and archived accounts have
 * left the working set. An empty query returns the (capped) active list:
 * a focused, unqueried field is a jump-to-account menu. */
export function matchAccounts<T extends Matchable>(
  accounts: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  const active = accounts.filter((account) => !account.archived)
  const matched =
    needle === ''
      ? active
      : active.filter((account) => account.label.toLowerCase().includes(needle))
  return matched.slice(0, MAX_ACCOUNT_RESULTS)
}
