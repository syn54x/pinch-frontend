// Relative imports on purpose: this module is on the vitest path, and the
// unit-test rig resolves no `@/` alias (the model.ts precedent).

// Pure manual-add logic (F10 CP5, #91): turning what the user typed into
// the API's signed integer minor units. Kept side-effect free so it
// unit-tests without mounting anything.

/** The backend's int4 bound on amount_minor — an out-of-range amount is
 * invalid input here, never a 400 there. */
const INT4_MAX = 2_147_483_647

/** Minor-unit exponent from Intl's own CLDR data (2 for USD, 0 for JPY,
 * 3 for BHD) — the formatMinorUnits discipline: no currency table. */
export function minorUnitDigits(currency: string): number {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })
  return formatter.resolvedOptions().maximumFractionDigits ?? 2
}

export type Direction = 'expense' | 'income'

/** Parse a typed magnitude ("24", "1,234.56", "$24.00") into unsigned
 * integer minor units, float-free (string slicing, the money.ts law).
 * Returns null for anything that isn't a positive in-range amount with at
 * most the currency's fraction digits — the sign belongs to the
 * Expense/Income selector, so a typed minus is a rejection, not a hint. */
export function parseAmountToMinor(
  raw: string,
  currency: string,
): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d*)?$/.test(cleaned)) return null
  const digits = minorUnitDigits(currency)
  const [major, fraction = ''] = cleaned.split('.')
  if (fraction.length > digits) return null
  const minor = Number(`${major}${fraction.padEnd(digits, '0')}`)
  if (!Number.isSafeInteger(minor) || minor === 0 || minor > INT4_MAX) {
    return null
  }
  return minor
}

/** The signed amount the endpoint wants: negative is money out (account's
 * perspective), so Expense negates the magnitude. */
export function signedMinor(magnitudeMinor: number, direction: Direction) {
  return direction === 'expense' ? -magnitudeMinor : magnitudeMinor
}

/** Local-time today as ISO `YYYY-MM-DD` — the date field's default. */
export function todayIso(today = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}
