import type { AccountKind, AccountReportOut } from '@/api/generated/types.gen'

// The Assets-vs-debts derivation (F10 CP2, wireframe 4f): both lines are
// client-derived from the net-worth report's per-account series — no new
// endpoint. Assets sum the asset-kind balances; debts sum the debt-kind
// balances as a positive magnitude. Indexed to the range start, the two lines
// both open at $0 and the gap between them reads off the net-worth change
// exactly: Δnet = Δassets − ΔdebtMagnitude. Pure, so vitest covers it.

const DEBT_KINDS: readonly AccountKind[] = ['credit', 'loan']

export function isDebtKind(kind: AccountKind): boolean {
  return DEBT_KINDS.includes(kind)
}

export interface AssetsDebtsPoint {
  date: string
  /** Sum of asset-kind balances (signed as reported; assets are positive). */
  assets_minor: number
  /** Debt as a positive magnitude — liabilities report negative balances. */
  debts_minor: number
}

/** Sum the per-account series into one assets line and one debts line, bucket
 * by bucket. An account with no point at a date (it didn't exist yet, or the
 * report started it later) contributes 0 — honest, not interpolated. */
export function deriveAssetsDebts(
  accounts: AccountReportOut[],
): AssetsDebtsPoint[] {
  const byDate = new Map<string, { assets: number; debts: number }>()
  for (const account of accounts) {
    const debt = isDebtKind(account.kind)
    for (const point of account.series) {
      const sums = byDate.get(point.date) ?? { assets: 0, debts: 0 }
      if (debt) sums.debts += -point.balance_minor
      else sums.assets += point.balance_minor
      byDate.set(point.date, sums)
    }
  }
  // ISO date strings sort lexicographically.
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, sums]) => ({
      date,
      assets_minor: sums.assets,
      debts_minor: sums.debts,
    }))
}

/** Re-express both lines as change since the first point — the 4f sign
 * convention: a paid-down debt dips below $0, growing assets rise above it,
 * and the gap between the lines is the net-worth change. */
export function indexToStart(points: AssetsDebtsPoint[]): AssetsDebtsPoint[] {
  const start = points[0]
  if (start === undefined) return []
  return points.map((point) => ({
    date: point.date,
    assets_minor: point.assets_minor - start.assets_minor,
    debts_minor: point.debts_minor - start.debts_minor,
  }))
}
