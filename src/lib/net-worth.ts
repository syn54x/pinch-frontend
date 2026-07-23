import type { Delta, Projection, SeriesPoint } from '@/api/generated/types.gen'

// Net Worth's client-side gates (F5 CP2, PRD Decision 10): rendering judgments,
// never fabrication. The server sends real numbers and, when it has enough
// signal, a projection; the client decides whether the derived things are shown
// honestly. Pure so both gates are unit-tested without a browser.

const DAY_MS = 86_400_000

/** History span in days (last − first date). 0 for an empty or single point. */
export function spanDays(series: SeriesPoint[]): number {
  if (series.length < 2) return 0
  // Date-only ISO strings parse as UTC midnight, so the diff is granularity-
  // proof (Decision 10) — daily or monthly buckets give the same span.
  const first = Date.parse(series[0].date)
  const last = Date.parse(series[series.length - 1].date)
  return Math.round((last - first) / DAY_MS)
}

/** The projection gate: a run-rate line needs ≥14 days of history behind it —
 * otherwise it's a ruler through two dots (s11e's "not ready" card). */
export function projectionReady(series: SeriesPoint[]): boolean {
  return spanDays(series) >= 14
}

/** Draw the dashed projection only when the server computed one AND the history
 * is long enough to trust it. */
export function showProjection(
  series: SeriesPoint[],
  projection: Projection | null,
): boolean {
  return projection !== null && projectionReady(series)
}

/** First day of `now`'s month as an ISO date string (local calendar). */
export function startOfMonthISO(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

/** The MoM gate: a month-over-month change needs data reaching back past the
 * start of the current month — otherwise there's no full month to compare
 * ("— · needs a full month"). ISO date strings compare lexicographically. */
export function momReady(series: SeriesPoint[], now: Date): boolean {
  if (series.length === 0) return false
  return series[0].date <= startOfMonthISO(now)
}

/** The tone a signed change wears: gains read positive, losses negative, a flat
 * change stays neutral ink (no false color). */
export function deltaTone(
  deltaMinor: number,
): 'positive' | 'negative' | 'muted' {
  if (deltaMinor > 0) return 'positive'
  if (deltaMinor < 0) return 'negative'
  return 'muted'
}

/** The ▲/▼/· glyph for a signed change. */
export function deltaGlyph(deltaMinor: number): string {
  if (deltaMinor > 0) return '▲'
  if (deltaMinor < 0) return '▼'
  return '·'
}

/** A Delta's percent as a display string ("12.9%"), or null when the reference
 * was zero (the server sends `percent: null` — never infinity). */
export function formatDeltaPercent(delta: Delta): string | null {
  if (delta.percent === null) return null
  return `${Math.abs(delta.percent).toFixed(1)}%`
}

/** How the since-range delta is phrased under the hero, by range. */
export function rangeSinceLabel(range: '1m' | '6m' | '1y' | 'all'): string {
  switch (range) {
    case '1m':
      return 'past month'
    case '6m':
      return 'past 6 months'
    case '1y':
      return 'this year'
    case 'all':
      return 'all time'
  }
}
