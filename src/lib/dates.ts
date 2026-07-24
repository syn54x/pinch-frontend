// Date-label formatting shared across surfaces (recurring rows, debt terms,
// net-worth charts). Everything parses ISO dates at LOCAL midnight so a label
// never slips a day across a timezone offset.

const monthDay = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const monthOnly = new Intl.DateTimeFormat(undefined, { month: 'short' })
const monthYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

/** Parse an ISO date (YYYY-MM-DD) at LOCAL midnight. */
export function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** "Mar 4" for a cycle's anchor date. */
export function formatMonthDay(iso: string): string {
  return monthDay.format(localDate(iso))
}

/** "Mar" for a stacked date badge. */
export function monthLabel(iso: string): string {
  return monthOnly.format(localDate(iso))
}

/** "Mar 2024" for a terms/payoff date or a chart label. */
export function formatMonthYear(iso: string): string {
  return monthYear.format(localDate(iso))
}
