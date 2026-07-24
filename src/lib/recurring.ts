import type { RecurringSeriesOut } from '@/api/generated/types.gen'
import { formatMonthDay, monthLabel } from './dates'
import { formatMinorUnits } from './money'

// Recurring's presentation logic as pure functions — the "This cycle" row's
// status line reads differently for each of the five cycle states, and income
// (sign-inferred) phrases differently from a bill. Kept here so every state is
// unit-tested without a browser (PRD Testing: vitest for pure logic).

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
      // The cadence values already read as plain adverbs ("monthly").
      return state.fixed
        ? series.cadence
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
): 'muted' | 'foreground' | 'negative' | 'warning' {
  switch (status) {
    case 'paid':
    case 'upcoming':
      return 'muted'
    case 'due':
      return 'foreground'
    case 'overdue':
      return 'negative'
    case 'lapsed':
      return 'warning'
  }
}
