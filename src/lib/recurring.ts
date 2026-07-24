import type {
  RecurringCadence,
  RecurringSeriesOut,
} from '@/api/generated/types.gen'
import { formatMinorUnits } from './money'

// Recurring's presentation logic as pure functions — the "This cycle" row's
// status line reads differently for each of the five cycle states, and income
// (sign-inferred) phrases differently from a bill. Kept here so every state is
// unit-tested without a browser (PRD Testing: vitest for pure logic).

const monthDay = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const monthOnly = new Intl.DateTimeFormat(undefined, { month: 'short' })

/** Parse an ISO date (YYYY-MM-DD) at LOCAL midnight so the label never slips a
 * day across a timezone offset. */
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function formatMonthDay(iso: string): string {
  return monthDay.format(localDate(iso))
}

export function monthLabel(iso: string): string {
  return monthOnly.format(localDate(iso))
}

/** The cadence as a plain adverb ("monthly"), the upcoming-row's resting label. */
export function cadenceLabel(cadence: RecurringCadence): string {
  switch (cadence) {
    case 'weekly':
      return 'weekly'
    case 'biweekly':
      return 'biweekly'
    case 'monthly':
      return 'monthly'
    case 'quarterly':
      return 'quarterly'
    case 'yearly':
      return 'yearly'
  }
}

/** Paid rows recede — the charge already happened this cycle. */
export function isPaidDimmed(series: RecurringSeriesOut): boolean {
  return series.state.status === 'paid'
}

/** The status line for a "This cycle" row, one phrasing per cycle state. */
export function cycleStatusText(
  series: RecurringSeriesOut,
  currency: string,
): string {
  const { state, direction } = series
  switch (state.status) {
    case 'paid': {
      const verb = direction > 0 ? 'received' : 'paid'
      return state.last_paid_date !== null
        ? `✓ ${verb} ${formatMonthDay(state.last_paid_date)}`
        : `✓ ${verb}`
    }
    case 'due': {
      if (state.due_in_days === null) return 'due'
      if (state.due_in_days <= 0) return 'due today'
      return `due in ${state.due_in_days}d`
    }
    case 'overdue':
      return state.due_in_days !== null
        ? `${Math.abs(state.due_in_days)}d overdue`
        : 'overdue'
    case 'upcoming':
      return state.fixed
        ? cadenceLabel(series.cadence)
        : `est. ${formatMinorUnits(state.est_amount_minor ?? 0, currency)}`
    case 'lapsed':
      return state.last_paid_date !== null
        ? `no charge since ${monthLabel(state.last_paid_date)} · dismiss?`
        : 'no charge lately · dismiss?'
  }
}

/** The status line's ink: paid/upcoming recede; due asks for attention;
 * overdue is a problem; lapsed is a gentle warning. */
export function cycleStatusTone(
  status: RecurringSeriesOut['state']['status'],
): 'muted' | 'foreground' | 'destructive' | 'warning' {
  switch (status) {
    case 'paid':
    case 'upcoming':
      return 'muted'
    case 'due':
      return 'foreground'
    case 'overdue':
      return 'destructive'
    case 'lapsed':
      return 'warning'
  }
}
