// Money display, and only display — arithmetic stays server-side (the
// backend's I-1 discipline: integer minor units, never floats).

/** Format signed integer minor units as a localized currency string.
 *
 * Genuinely float-free: the minor units are split into major/fraction by
 * string slicing and handed to Intl as a decimal string (ES2023 `format`
 * accepts numeric strings), so no division ever happens. The minor-unit
 * exponent comes from Intl's own CLDR data (2 for USD, 0 for JPY, 3 for
 * BHD) — no currency table is maintained here.
 */
export function formatMinorUnits(
  amountMinor: number,
  currency: string,
): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  const sign = amountMinor < 0 ? '-' : ''
  const raw = String(Math.abs(amountMinor)).padStart(digits + 1, '0')
  const decimal =
    digits === 0 ? raw : `${raw.slice(0, -digits)}.${raw.slice(-digits)}`
  // Numeric by construction (digits and one dot); the cast just tells TS so.
  return formatter.format(`${sign}${decimal}` as Intl.StringNumericLiteral)
}
