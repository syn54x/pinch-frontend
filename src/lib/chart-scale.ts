// Pure scale & format helpers for charts — axis ticks, compact labels, percents.
// Exact money display stays with formatMinorUnits (integer minor units, float-
// free); the compact helpers here are for AXIS LABELS, which are inherently
// approximate, so a single documented scaling division is acceptable there.

/** Compact a plain number: 1234 → "1.2K", 1_500_000 → "1.5M". */
export function abbreviateNumber(
  value: number,
  maximumFractionDigits = 1,
): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits,
  }).format(value)
}

/** Compact currency axis label from integer minor units: 4_000_000 USD → "$40K".
 *
 * Unlike formatMinorUnits this scales minor→major with one division — only ever
 * used for approximate axis ticks, never for a displayed exact amount. */
export function formatCompactMinorUnits(
  amountMinor: number,
  currency: string,
  maximumFractionDigits = 1,
): string {
  // The minor-unit exponent comes from a plain currency formatter (CLDR: 2 for
  // USD, 0 for JPY, 3 for BHD) — the compact formatter's own fraction digits
  // reflect the compact override, not the currency's scale.
  const exponent =
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits,
  }).format(amountMinor / 10 ** exponent)
}

/** Format a 0..1 fraction as a percent string: 0.34 → "34%". */
export function formatPercent(
  fraction: number,
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits,
  }).format(fraction)
}

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let niceFraction: number
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }
  return niceFraction * 10 ** exponent
}

/** Evenly-spaced round tick values covering [min, max] (the classic "nice
 * numbers" algorithm). Returns a single tick when the range is degenerate. */
export function niceTicks(
  rawMin: number,
  rawMax: number,
  targetCount = 5,
): number[] {
  const min = Math.min(rawMin, rawMax)
  const max = Math.max(rawMin, rawMax)
  if (min === max || !Number.isFinite(max - min)) return [min]
  const step = niceNum(
    niceNum(max - min, false) / Math.max(1, targetCount - 1),
    true,
  )
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    // Round away float accumulation (0.1 + 0.2 …) at the step's precision.
    ticks.push(Number(v.toFixed(decimals)))
  }
  return ticks
}

/** The rounded [min, max] domain enclosing the data at nice tick boundaries. */
export function niceDomain(
  rawMin: number,
  rawMax: number,
  targetCount = 5,
): [number, number] {
  const ticks = niceTicks(rawMin, rawMax, targetCount)
  if (ticks.length === 1) return [ticks[0], ticks[0]]
  return [ticks[0], ticks[ticks.length - 1]]
}
