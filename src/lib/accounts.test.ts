import { describe, expect, it } from 'vitest'
import type { AccountKind, AccountOut } from '@/api/generated/types.gen'
import {
  accountBalanceMinor,
  groupAccounts,
  primaryCurrency,
  totalBalanceMinor,
} from './accounts'

function account(
  kind: AccountKind,
  label: string,
  balanceMinor: number | null,
  currency = 'USD',
): AccountOut {
  return {
    id: label,
    kind,
    label,
    currency,
    mask: null,
    manual: false,
    archived: false,
    balance:
      balanceMinor === null
        ? null
        : { amount_minor: balanceMinor, currency, as_of: '2026-07-01' },
    terms: null,
    created_at: '2026-01-01',
  }
}

const ACCOUNTS = [
  account('loan', 'Auto Loan', -41_200_00),
  account('depository', 'Checking', 12_430_00),
  account('investment', 'Brokerage', 198_200_00),
  account('depository', 'Savings', 5_970_00),
  account('asset', 'Home', 115_000_00),
]

describe('groupAccounts', () => {
  it('groups by category in wireframe order with subtotals', () => {
    const groups = groupAccounts(ACCOUNTS)
    expect(groups.map((g) => g.label)).toEqual([
      'Cash',
      'Investments',
      'Property',
      'Liabilities',
    ])
    const cash = groups[0]
    expect(cash.accounts.map((a) => a.label)).toEqual(['Checking', 'Savings'])
    expect(cash.subtotalMinor).toBe(12_430_00 + 5_970_00)
    expect(groups[3].subtotalMinor).toBe(-41_200_00)
  })

  it('drops empty categories', () => {
    const groups = groupAccounts([account('depository', 'Only', 100)])
    expect(groups.map((g) => g.label)).toEqual(['Cash'])
  })
})

describe('totals', () => {
  it('sums across all accounts, assets minus liabilities', () => {
    // 12,430 + 5,970 + 198,200 + 115,000 − 41,200 = 290,400
    expect(totalBalanceMinor(ACCOUNTS)).toBe(290_400_00)
  })

  it('treats a missing balance as zero', () => {
    expect(accountBalanceMinor(account('asset', 'House', null))).toBe(0)
    expect(totalBalanceMinor([account('asset', 'House', null)])).toBe(0)
  })
})

describe('primaryCurrency', () => {
  it('uses the first account with a balance, else USD', () => {
    expect(primaryCurrency([account('depository', 'A', 100, 'EUR')])).toBe(
      'EUR',
    )
    expect(primaryCurrency([account('asset', 'House', null)])).toBe('USD')
    expect(primaryCurrency([])).toBe('USD')
  })
})
