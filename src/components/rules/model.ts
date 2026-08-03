// F4 CP2 (#60): the wire ConditionSpec <-> builder form mapping and the
// one condition-sentence formatter every list row uses. The wire shape is
// the backend's versioned spec (v1: payee / amount / day_of_month) —
// this module is presentation only, never validation (the API is the
// validator; its 400s surface as copy).
import { formatMinorUnits } from '@/lib/money'

export type ConditionWire = {
  version?: number
  payee?: { op: 'equals' | 'contains'; value: string } | null
  amount?: {
    op: 'equals' | 'between'
    value?: number | null
    lo?: number | null
    hi?: number | null
    direction: 'out' | 'in' | 'either'
    currency?: string | null
  } | null
  day_of_month?: {
    op: 'equals' | 'between'
    value?: number | null
    lo?: number | null
    hi?: number | null
  } | null
}

const DIRECTION_LABEL = { out: 'out', in: 'in', either: '' } as const

/** One human sentence per condition — "payee contains "costco" · at least
 * $50.00 out" — for rule rows and suggestion cards. */
export function conditionSentence(condition: ConditionWire): string {
  const parts: string[] = []
  if (condition.payee) {
    parts.push(`payee ${condition.payee.op} "${condition.payee.value}"`)
  }
  const amount = condition.amount
  if (amount) {
    const currency = amount.currency ?? 'USD'
    const money = (minor: number) => formatMinorUnits(minor, currency)
    const direction = DIRECTION_LABEL[amount.direction]
    if (amount.op === 'equals' && amount.value != null) {
      parts.push(`exactly ${money(amount.value)} ${direction}`.trim())
    } else if (amount.lo != null && amount.hi != null) {
      parts.push(`${money(amount.lo)}–${money(amount.hi)} ${direction}`.trim())
    } else if (amount.lo != null) {
      parts.push(`at least ${money(amount.lo)} ${direction}`.trim())
    } else if (amount.hi != null) {
      parts.push(`at most ${money(amount.hi)} ${direction}`.trim())
    }
  }
  const day = condition.day_of_month
  if (day) {
    if (day.op === 'equals' && day.value != null) {
      parts.push(`on day ${day.value}`)
    } else {
      parts.push(`on days ${day.lo ?? 1}–${day.hi ?? 31}`)
    }
  }
  return parts.join(' · ')
}

/** Dollars-and-cents string -> positive minor units, or null when blank or
 * unparseable. Display-side only; the API revalidates. */
export function parseAmountMinor(raw: string): number | null {
  const trimmed = raw.trim().replace(/^\$/, '')
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [major, fraction = ''] = trimmed.split('.')
  return Number(major) * 100 + Number(fraction.padEnd(2, '0') || 0)
}
