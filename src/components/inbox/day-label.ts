// Day-group voice from wireframe #7: "Today · Jul 21", "Yesterday · Jul 20",
// then plain dates ("Jul 18", with the year once it differs). Transaction
// dates are calendar dates (YYYY-MM-DD), so all math stays in local days —
// no timezone drift from parsing ISO dates as UTC midnight.

function parseLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** "Jul 21", growing a year when it isn't this year's. */
export function formatDay(isoDate: string, today = new Date()): string {
  const date = parseLocal(isoDate)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  })
}

/** The group heading: relative voice for the two days users live in. */
export function dayLabel(isoDate: string, today = new Date()): string {
  const date = parseLocal(isoDate)
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round(
    (startOfDay(today) - startOfDay(date)) / (24 * 3600 * 1000),
  )
  const formatted = formatDay(isoDate, today)
  if (days === 0) return `Today · ${formatted}`
  if (days === 1) return `Yesterday · ${formatted}`
  return formatted
}
