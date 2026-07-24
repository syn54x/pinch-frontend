import type { AccountKind, AccountOut } from '@/api/generated/types.gen'

// Accounts, grouped the way the wireframe reads them (s-Accounts): assets by
// category, liabilities last, each with a subtotal, and a running total across
// all of them. Pure so the grouping + sums are unit-tested.

export type AccountCategory =
  | 'cash'
  | 'investments'
  | 'property'
  | 'liabilities'

const CATEGORY_OF: Record<AccountKind, AccountCategory> = {
  depository: 'cash',
  investment: 'investments',
  asset: 'property',
  loan: 'liabilities',
  credit: 'liabilities',
}

const ORDER: { key: AccountCategory; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'investments', label: 'Investments' },
  { key: 'property', label: 'Property' },
  { key: 'liabilities', label: 'Liabilities' },
]

export interface AccountGroup {
  key: AccountCategory
  label: string
  accounts: AccountOut[]
  subtotalMinor: number
}

/** An account's balance in minor units — 0 when it has none yet (a real $0 and
 * a missing balance both contribute nothing to the totals). */
export function accountBalanceMinor(account: AccountOut): number {
  return account.balance?.amount_minor ?? 0
}

/** Group by category in the wireframe's order, dropping empty groups, each with
 * its subtotal. */
export function groupAccounts(accounts: AccountOut[]): AccountGroup[] {
  return ORDER.map(({ key, label }) => {
    const inGroup = accounts.filter((a) => CATEGORY_OF[a.kind] === key)
    return {
      key,
      label,
      accounts: inGroup,
      subtotalMinor: inGroup.reduce(
        (sum, a) => sum + accountBalanceMinor(a),
        0,
      ),
    }
  }).filter((group) => group.accounts.length > 0)
}

/** The running total across every account (assets minus liabilities). */
export function totalBalanceMinor(accounts: AccountOut[]): number {
  return accounts.reduce((sum, a) => sum + accountBalanceMinor(a), 0)
}

/** The currency to format the totals in — the first account's, else USD. */
export function primaryCurrency(accounts: AccountOut[]): string {
  return accounts.find((a) => a.balance !== null)?.balance?.currency ?? 'USD'
}
