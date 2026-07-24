import type { AccountKind, AccountOut } from '@/api/generated/types.gen'
import { relativeTime } from './time'

// Accounts, grouped the way the wireframe reads them (s-Accounts): assets by
// category, liabilities last, each with a subtotal, and a running total across
// all of them. Pure so the grouping + sums are unit-tested.

/** Loans and credit cards are debt — they carry terms and deep-link to the
 * Debt view. */
export function isDebtAccount(account: AccountOut): boolean {
  return account.kind === 'loan' || account.kind === 'credit'
}

/** The row's honest sub-line from the fields we actually have: a loan's APR, and
 * the balance's provenance. `manual` is a property of the account itself, so it
 * shows even before a balance exists — an account that just survived a
 * disconnect is manual with nothing synced yet. `synced` describes a balance's
 * origin, so it only appears once there's a balance to describe. */
export function accountSubline(account: AccountOut): string {
  const parts: string[] = []
  if (isDebtAccount(account) && account.terms?.apr != null) {
    parts.push(`${account.terms.apr}% APR`)
  }
  if (account.manual) {
    parts.push(
      account.balance !== null
        ? `manual · ${relativeTime(account.balance.as_of)}`
        : 'manual',
    )
  } else if (account.balance !== null) {
    parts.push(`synced ${relativeTime(account.balance.as_of)}`)
  }
  return parts.join(' · ')
}

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
