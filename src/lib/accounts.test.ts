import { describe, expect, it } from 'vitest'
import type { AccountKind, AccountOut } from '@/api/generated/types.gen'
import {
  accountBalanceMinor,
  accountSubline,
  groupAccounts,
  isDebtAccount,
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

/** Build an account with the fields accountSubline reads. */
function subAccount(
  overrides: Partial<AccountOut> & Pick<AccountOut, 'kind'>,
): AccountOut {
  return { ...account(overrides.kind, 'A', null), ...overrides }
}

describe('accountSubline', () => {
  it('shows "manual" even without a balance — a disconnected account survives as manual', () => {
    // The regression: CP4 tied the manual/synced label to the balance, so a
    // balance-less manual account (post-disconnect) showed nothing.
    expect(
      accountSubline(
        subAccount({ kind: 'depository', manual: true, balance: null }),
      ),
    ).toBe('manual')
  })

  it('appends the balance recency to a manual account once it has one', () => {
    const line = accountSubline(
      subAccount({
        kind: 'depository',
        manual: true,
        balance: { amount_minor: 100, currency: 'USD', as_of: '2026-07-01' },
      }),
    )
    expect(line).toMatch(/^manual · /)
  })

  it('shows "synced" only when a synced balance exists, nothing without one', () => {
    expect(
      accountSubline(
        subAccount({
          kind: 'depository',
          manual: false,
          balance: { amount_minor: 100, currency: 'USD', as_of: '2026-07-01' },
        }),
      ),
    ).toMatch(/^synced /)
    expect(
      accountSubline(
        subAccount({ kind: 'depository', manual: false, balance: null }),
      ),
    ).toBe('')
  })

  it("leads with a loan's APR, then its provenance", () => {
    const line = accountSubline(
      subAccount({
        kind: 'loan',
        manual: true,
        balance: null,
        terms: {
          apr: 4.9,
          minimum_payment_minor: null,
          origination_amount_minor: null,
          origination_date: null,
          maturity_date: null,
        },
      }),
    )
    expect(line).toBe('4.9% APR · manual')
  })
})

describe('isDebtAccount', () => {
  it('is true for loans and credit, false otherwise', () => {
    expect(isDebtAccount(account('loan', 'L', null))).toBe(true)
    expect(isDebtAccount(account('credit', 'C', null))).toBe(true)
    expect(isDebtAccount(account('depository', 'D', null))).toBe(false)
    expect(isDebtAccount(account('asset', 'A', null))).toBe(false)
  })
})
