import type {
  DaySpending,
  LedgerStatsOut,
  UpcomingBill,
} from '@/api/generated/types.gen'

// The Dashboard's pure presentation logic (F5 CP5, wireframe s6). Every number
// on the Dashboard is real from the merged M8 client; these helpers only shape
// it for display — greeting voice, the To-review provenance split, the bills
// one-liner, spending sparkline heights, and the Fix-drawer queue position.
// Pure so the fiddly edges (null recurring count, day-then-row queue index) are
// unit-tested without a browser.

/** Time-of-day greeting ("Good morning" before noon, "Good afternoon" until
 * 6pm, "Good evening" after) — the component appends ", {name}". */
export function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The three provenance keys the To-review tile splits on, in wireframe order
 * (ai · rule · hist). Detection/none aren't split out here — the tile mirrors
 * the deck's three named lineages. */
export const PROVENANCE_SPLIT_KEYS = ['ai', 'rule', 'history'] as const
export type ProvenanceSplitKey = (typeof PROVENANCE_SPLIT_KEYS)[number]

/** The To-review breakdown: the ai/rule/history counts in fixed order, with
 * zero (or absent) buckets dropped — the wart that `unreviewed_by_provenance`
 * is stringly-keyed is absorbed here (PRD: frontend hardcodes ai/rule/history). */
export function provenanceSplit(
  byProvenance: LedgerStatsOut['unreviewed_by_provenance'],
): Array<{ key: ProvenanceSplitKey; count: number }> {
  return PROVENANCE_SPLIT_KEYS.flatMap((key) => {
    const count = byProvenance[key] ?? 0
    return count > 0 ? [{ key, count }] : []
  })
}

const MAX_BILL_NAMES = 3

/** The Next-7-days tile's sub-line: the first few payees, then "+N" for the
 * rest ("Rent, Netflix, PG&E +2"). Empty when nothing is due. */
export function billsSummary(bills: UpcomingBill[]): string {
  if (bills.length === 0) return ''
  const names = bills.slice(0, MAX_BILL_NAMES).map((bill) => bill.display_name)
  const remainder = bills.length - names.length
  const shown = names.join(', ')
  return remainder > 0 ? `${shown} +${remainder}` : shown
}

/** Intra-month spending as sparkline bar heights — magnitudes, since the bars
 * carry no sign (the value beside them does). */
export function sparkValues(byDay: DaySpending[]): number[] {
  return byDay.map((day) => Math.abs(day.total_minor))
}

/** The Fix drawer's "1 of 12": the focused row's 1-based position in the
 * day-then-row queue and the queue length. Position 0 when nothing is focused
 * or the row has left (external change renumbers, never errors). */
export function queuePosition(
  ids: string[],
  focusId: string | null,
): { position: number; total: number } {
  const total = ids.length
  if (focusId === null) return { position: 0, total }
  const index = ids.indexOf(focusId)
  return { position: index === -1 ? 0 : index + 1, total }
}

/** The day-group index a row lives in — the drawer's focused txn drives which
 * day pane the card shows, so Save across a day boundary syncs the pane. -1
 * when the row isn't present. */
export function dayIndexOf(
  groups: Array<{ date: string; rows: Array<{ id: string }> }>,
  id: string | null,
): number {
  if (id === null) return -1
  return groups.findIndex((group) => group.rows.some((row) => row.id === id))
}
