import { describe, expect, it } from 'vitest'
import type { AccountReportOut } from '@/api/generated/types.gen'
import { deriveAssetsDebts, indexToStart, isDebtKind } from './assets-debts'

function account(
  kind: AccountReportOut['kind'],
  series: [string, number][],
): AccountReportOut {
  return {
    id: `${kind}-${series.length}`,
    label: kind,
    kind,
    currency: 'USD',
    balance_minor: series[series.length - 1]?.[1] ?? 0,
    series: series.map(([date, balance_minor]) => ({ date, balance_minor })),
  }
}

describe('isDebtKind', () => {
  it('splits the five kinds into the 4f sides', () => {
    expect(isDebtKind('credit')).toBe(true)
    expect(isDebtKind('loan')).toBe(true)
    expect(isDebtKind('depository')).toBe(false)
    expect(isDebtKind('investment')).toBe(false)
    expect(isDebtKind('asset')).toBe(false)
  })
})

describe('deriveAssetsDebts', () => {
  it('sums asset kinds into one line and debt kinds (as magnitude) into the other', () => {
    const points = deriveAssetsDebts([
      account('depository', [
        ['2026-07-01', 100_000],
        ['2026-07-02', 110_000],
      ]),
      account('investment', [
        ['2026-07-01', 50_000],
        ['2026-07-02', 52_000],
      ]),
      account('loan', [
        ['2026-07-01', -80_000],
        ['2026-07-02', -78_000],
      ]),
    ])
    expect(points).toEqual([
      { date: '2026-07-01', assets_minor: 150_000, debts_minor: 80_000 },
      { date: '2026-07-02', assets_minor: 162_000, debts_minor: 78_000 },
    ])
  })

  it('sorts by date and treats an account with no point that day as 0', () => {
    const points = deriveAssetsDebts([
      account('depository', [
        ['2026-07-02', 200],
        ['2026-07-01', 100],
      ]),
      // The credit card only reports from the 2nd.
      account('credit', [['2026-07-02', -50]]),
    ])
    expect(points).toEqual([
      { date: '2026-07-01', assets_minor: 100, debts_minor: 0 },
      { date: '2026-07-02', assets_minor: 200, debts_minor: 50 },
    ])
  })

  it('is empty for no accounts', () => {
    expect(deriveAssetsDebts([])).toEqual([])
  })
})

describe('indexToStart (the 4f sign convention)', () => {
  it('opens both lines at 0; paydown dips debts below it, and the gap is the net-worth change', () => {
    const indexed = indexToStart([
      { date: '2026-07-01', assets_minor: 150_000, debts_minor: 80_000 },
      { date: '2026-07-02', assets_minor: 162_000, debts_minor: 78_000 },
    ])
    expect(indexed[0]).toEqual({
      date: '2026-07-01',
      assets_minor: 0,
      debts_minor: 0,
    })
    expect(indexed[1]).toEqual({
      date: '2026-07-02',
      assets_minor: 12_000,
      debts_minor: -2_000,
    })
    // gap = assets − debts = Δnet: (162 − 78) − (150 − 80) = 14 = 12 − (−2).
    const last = indexed[1]
    expect(last.assets_minor - last.debts_minor).toBe(14_000)
  })

  it('is empty for an empty series', () => {
    expect(indexToStart([])).toEqual([])
  })
})
