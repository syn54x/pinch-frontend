// Debt's term↔maturity math and terms-form coercions, as pure functions. The
// backend stores maturity_date, origination_date, and origination_amount
// independently — it does NOT derive one from a "term". So the form's "Term
// (months)" is a frontend convenience: we fold Opened + Term into maturity_date
// on save (Decision 2, "term months derived, never stored"), and derive the
// term back from the two dates for display. Kept here so the math is unit-tested.

const monthYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

/** ISO date at LOCAL midnight so month/year labels never slip across an offset. */
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** "Mar 2024" for a terms/payoff date. */
export function formatMonthYear(iso: string): string {
  return monthYear.format(localDate(iso))
}

/** Add `months` to an ISO date, clamping the day to the target month's length. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 // 0-based month
  const daysInMonth = new Date(ny, nm + 1, 0).getDate()
  const nd = Math.min(d, daysInMonth)
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

/** Whole months between two ISO dates by calendar (day-agnostic — terms and the
 * month inputs are month-granular, so first-of-month in, first-of-month out). */
export function monthsBetween(startIso: string, endIso: string): number {
  const [ys, ms] = startIso.split('-').map(Number)
  const [ye, me] = endIso.split('-').map(Number)
  return (ye - ys) * 12 + (me - ms)
}

/** Fold Opened + Term into the stored maturity_date. */
export function deriveMaturity(openedIso: string, termMonths: number): string {
  return addMonths(openedIso, termMonths)
}

/** Recover the display term (months) from the two stored dates. */
export function deriveTermMonths(
  openedIso: string | null,
  maturityIso: string | null,
): number | null {
  if (openedIso === null || maturityIso === null) return null
  return monthsBetween(openedIso, maturityIso)
}

/** A month input ("MM/YYYY", also "MM / YYYY" / "YYYY-MM") → ISO first-of-month,
 * or null when it doesn't parse (the field is optional; a bad value is dropped). */
export function parseMonthInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const slash = trimmed.match(/^(\d{1,2})\s*\/\s*(\d{4})$/)
  if (slash) {
    const month = Number(slash[1])
    if (month < 1 || month > 12) return null
    return `${slash[2]}-${String(month).padStart(2, '0')}-01`
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (iso) {
    const month = Number(iso[2])
    if (month < 1 || month > 12) return null
    return `${iso[1]}-${iso[2]}-01`
  }
  return null
}

/** ISO first-of-month → "MM/YYYY" for pre-filling the month input. */
export function formatMonthInput(iso: string | null): string {
  if (iso === null) return ''
  const [y, m] = iso.split('-')
  return `${m}/${y}`
}
