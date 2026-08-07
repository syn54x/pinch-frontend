import { afterEach, describe, expect, it } from 'vitest'
import type {
  AccountOut,
  AccountReportOut,
  NetWorthOut,
} from '@/api/generated/types.gen'
import { deriveSidebarGroups, readCollapsedGroups } from './sidebar'

function account(
  overrides: Partial<AccountOut> & Pick<AccountOut, 'id' | 'kind'>,
): AccountOut {
  return {
    label: overrides.label ?? overrides.id,
    currency: 'USD',
    mask: null,
    manual: true,
    archived: false,
    balance: null,
    terms: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function reportAccount(
  overrides: Partial<AccountReportOut> & Pick<AccountReportOut, 'id' | 'kind'>,
): AccountReportOut {
  return {
    label: overrides.id,
    currency: 'USD',
    balance_minor: 0,
    series: [],
    ...overrides,
  }
}

function report(overrides: Partial<NetWorthOut> = {}): NetWorthOut {
  return {
    as_of: '2026-08-07',
    range: '6m',
    granularity: 'week',
    currency: 'USD',
    net_worth_minor: 0,
    assets_minor: 0,
    liabilities_minor: 0,
    month_to_date: { delta_minor: 0, percent: null },
    since_range_start: { delta_minor: 0, percent: null },
    series: [],
    projection: null,
    accounts: [],
    excluded: [],
    ...overrides,
  }
}

describe('deriveSidebarGroups', () => {
  it('maps kinds to Cash / Investments / Property / Debt, credit and loan sharing Debt', () => {
    const accounts = [
      account({ id: 'checking', kind: 'depository', label: 'Chase Checking' }),
      account({ id: 'brokerage', kind: 'investment', label: 'Fidelity' }),
      account({ id: 'home', kind: 'asset', label: 'Home' }),
      account({ id: 'card', kind: 'credit', label: 'Visa' }),
      account({ id: 'auto', kind: 'loan', label: 'Auto Loan' }),
    ]
    const nwReport = report({
      accounts: [
        reportAccount({
          id: 'checking',
          kind: 'depository',
          balance_minor: 12_430_00,
        }),
        reportAccount({
          id: 'brokerage',
          kind: 'investment',
          balance_minor: 198_200_00,
        }),
        reportAccount({ id: 'home', kind: 'asset', balance_minor: 115_000_00 }),
        reportAccount({ id: 'card', kind: 'credit', balance_minor: -2_800_00 }),
        reportAccount({ id: 'auto', kind: 'loan', balance_minor: -28_400_00 }),
      ],
    })

    const groups = deriveSidebarGroups(accounts, nwReport)

    expect(groups.map((g) => g.key)).toEqual([
      'cash',
      'investments',
      'property',
      'debt',
    ])
    const debt = groups.find((g) => g.key === 'debt')
    expect(debt?.accounts.map((a) => a.id)).toEqual(['card', 'auto'])
    expect(debt?.totalMinor).toBe(-31_200_00)
  })

  it('groups keep the report order, cash total as a real sum', () => {
    const accounts = [
      account({ id: 'checking', kind: 'depository' }),
      account({ id: 'savings', kind: 'depository' }),
    ]
    const nwReport = report({
      accounts: [
        reportAccount({
          id: 'checking',
          kind: 'depository',
          balance_minor: 12_430_00,
        }),
        reportAccount({
          id: 'savings',
          kind: 'depository',
          balance_minor: 5_970_00,
        }),
      ],
    })

    const groups = deriveSidebarGroups(accounts, nwReport)
    expect(groups).toHaveLength(1)
    expect(groups[0].totalMinor).toBe(18_400_00)
  })

  it('drops empty groups entirely — no Investments row when nothing is invested', () => {
    const accounts = [account({ id: 'checking', kind: 'depository' })]
    const nwReport = report({
      accounts: [
        reportAccount({
          id: 'checking',
          kind: 'depository',
          balance_minor: 100,
        }),
      ],
    })
    const groups = deriveSidebarGroups(accounts, nwReport)
    expect(groups.map((g) => g.key)).toEqual(['cash'])
  })

  it('an account the report excludes (no FX path) renders in its group at its native balance, outside the total', () => {
    const accounts = [
      account({ id: 'usd-checking', kind: 'depository', currency: 'USD' }),
      account({
        id: 'eur-checking',
        kind: 'depository',
        currency: 'EUR',
        balance: {
          amount_minor: 50_000,
          currency: 'EUR',
          as_of: '2026-08-01T00:00:00Z',
        },
      }),
    ]
    // The report only ever lists accounts it could convert (fx.py: v0 is
    // same-currency-only) — the EUR account is simply absent, never present
    // with a converted figure.
    const nwReport = report({
      currency: 'USD',
      accounts: [
        reportAccount({
          id: 'usd-checking',
          kind: 'depository',
          balance_minor: 10_000,
        }),
      ],
    })

    const groups = deriveSidebarGroups(accounts, nwReport)
    const cash = groups.find((g) => g.key === 'cash')
    expect(cash?.accounts).toHaveLength(2)

    const excludedRow = cash?.accounts.find((a) => a.id === 'eur-checking')
    expect(excludedRow).toEqual({
      id: 'eur-checking',
      label: 'eur-checking',
      balanceMinor: 50_000,
      currency: 'EUR',
      excluded: true,
    })
    // The total is the USD account alone — the EUR balance never joins it.
    expect(cash?.totalMinor).toBe(10_000)
  })

  it('an excluded account with no balance entry yet renders at zero, still outside the total', () => {
    const accounts = [
      account({ id: 'new-eur', kind: 'asset', currency: 'EUR', balance: null }),
    ]
    const nwReport = report({ currency: 'USD', accounts: [] })
    const groups = deriveSidebarGroups(accounts, nwReport)
    expect(groups[0].accounts[0]).toMatchObject({
      balanceMinor: 0,
      currency: 'EUR',
      excluded: true,
    })
    expect(groups[0].totalMinor).toBe(0)
  })

  it('ignores archived accounts even if the caller forgot to filter them', () => {
    const accounts = [
      account({ id: 'closed', kind: 'depository', archived: true }),
      account({ id: 'open', kind: 'depository' }),
    ]
    const nwReport = report({
      accounts: [
        reportAccount({ id: 'open', kind: 'depository', balance_minor: 500 }),
      ],
    })
    const groups = deriveSidebarGroups(accounts, nwReport)
    expect(groups[0].accounts.map((a) => a.id)).toEqual(['open'])
  })

  it('is empty when the ledger has no accounts', () => {
    expect(deriveSidebarGroups([], report())).toEqual([])
  })
})

describe('readCollapsedGroups (localStorage parsing)', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('is empty when nothing is stored', () => {
    expect(readCollapsedGroups()).toEqual(new Set())
  })

  it('round-trips a stored set of valid keys', () => {
    localStorage.setItem(
      'pinch-sidebar-collapsed-groups',
      JSON.stringify(['cash', 'debt']),
    )
    expect(readCollapsedGroups()).toEqual(new Set(['cash', 'debt']))
  })

  it('degrades to empty on malformed JSON rather than throwing', () => {
    localStorage.setItem('pinch-sidebar-collapsed-groups', '{not json')
    expect(readCollapsedGroups()).toEqual(new Set())
  })

  it('drops unknown values instead of trusting a hand-edited/stale key', () => {
    localStorage.setItem(
      'pinch-sidebar-collapsed-groups',
      JSON.stringify(['cash', 'liabilities', 42]),
    )
    expect(readCollapsedGroups()).toEqual(new Set(['cash']))
  })

  it('degrades to empty when storage holds a non-array value', () => {
    localStorage.setItem(
      'pinch-sidebar-collapsed-groups',
      JSON.stringify({ cash: true }),
    )
    expect(readCollapsedGroups()).toEqual(new Set())
  })
})
