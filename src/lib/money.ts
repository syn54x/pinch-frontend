// Money display, and only display — arithmetic stays server-side (the
// backend's I-1 discipline: integer minor units, never floats).

/** Format signed integer minor units as a localized currency string.
 *
 * The one float operation here — dividing by a power of ten — is safe for
 * display: integers below 2^52 divide with sub-ULP representation error,
 * and Intl's rounding to exactly `fractionDigits` decimals absorbs it.
 * The minor-unit exponent comes from Intl's own CLDR data (2 for USD,
 * 0 for JPY, 3 for BHD), so no currency table is maintained here.
 */
export function formatMinorUnits(
  amountMinor: number,
  currency: string,
): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(amountMinor / 10 ** fractionDigits)
}
