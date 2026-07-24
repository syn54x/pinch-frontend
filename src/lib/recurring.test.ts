import { describe, expect, it } from 'vitest'
import type {
  CycleStateOut,
  RecurringSeriesOut,
} from '@/api/generated/types.gen'
import {
  cadenceLabel,
  cycleStatusText,
  cycleStatusTone,
  isPaidDimmed,
  monthLabel,
} from './recurring'

function series(
  state: Partial<CycleStateOut>,
  overrides: Partial<RecurringSeriesOut> = {},
): RecurringSeriesOut {
  return {
    id: 's1',
    account_id: 'a1',
    payee: 'NETFLIX.COM',
    direction: -1,
    amount_minor: -1549,
    cadence: 'monthly',
    kind: 'subscription',
    status: 'active',
    display_name: 'Netflix',
    bucket: 'Subscriptions',
    state: {
      status: 'upcoming',
      last_paid_date: null,
      next_due_date: null,
      due_in_days: null,
      fixed: true,
      est_amount_minor: -1549,
      monthly_minor: -1549,
      ...state,
    },
    ...overrides,
  }
}

describe('cycleStatusText — the five states', () => {
  it('paid: ✓ + verb + date, "paid" for an outflow', () => {
    expect(
      cycleStatusText(
        series({ status: 'paid', last_paid_date: '2026-07-15' }),
        'USD',
      ),
    ).toBe('✓ paid Jul 15')
  })

  it('paid: "received" for income (positive direction)', () => {
    expect(
      cycleStatusText(
        series(
          { status: 'paid', last_paid_date: '2026-07-05' },
          { direction: 1, kind: 'income' },
        ),
        'USD',
      ),
    ).toBe('✓ received Jul 5')
  })

  it('due: "due in Nd", and "due today" at zero', () => {
    expect(
      cycleStatusText(series({ status: 'due', due_in_days: 4 }), 'USD'),
    ).toBe('due in 4d')
    expect(
      cycleStatusText(series({ status: 'due', due_in_days: 0 }), 'USD'),
    ).toBe('due today')
  })

  it('overdue: absolute days overdue', () => {
    expect(
      cycleStatusText(series({ status: 'overdue', due_in_days: -3 }), 'USD'),
    ).toBe('3d overdue')
  })

  it('upcoming: cadence when fixed, est amount when it varies', () => {
    expect(
      cycleStatusText(series({ status: 'upcoming', fixed: true }), 'USD'),
    ).toBe('monthly')
    expect(
      cycleStatusText(
        series({
          status: 'upcoming',
          fixed: false,
          est_amount_minor: -12000,
        }),
        'USD',
      ),
    ).toBe('est. -$120.00')
  })

  it('lapsed: the "no charge since X · dismiss?" nudge', () => {
    expect(
      cycleStatusText(
        series({ status: 'lapsed', last_paid_date: '2026-05-02' }),
        'USD',
      ),
    ).toBe('no charge since May · dismiss?')
  })

  it('degrades gracefully when dates are missing', () => {
    expect(
      cycleStatusText(series({ status: 'paid', last_paid_date: null }), 'USD'),
    ).toBe('✓ paid')
    expect(
      cycleStatusText(
        series({ status: 'lapsed', last_paid_date: null }),
        'USD',
      ),
    ).toBe('no charge lately · dismiss?')
  })
})

describe('cycleStatusTone', () => {
  it('recedes for paid/upcoming, escalates for due/overdue/lapsed', () => {
    expect(cycleStatusTone('paid')).toBe('muted')
    expect(cycleStatusTone('upcoming')).toBe('muted')
    expect(cycleStatusTone('due')).toBe('foreground')
    expect(cycleStatusTone('overdue')).toBe('destructive')
    expect(cycleStatusTone('lapsed')).toBe('warning')
  })
})

describe('isPaidDimmed', () => {
  it('dims only paid rows', () => {
    expect(isPaidDimmed(series({ status: 'paid' }))).toBe(true)
    expect(isPaidDimmed(series({ status: 'due' }))).toBe(false)
  })
})

describe('cadenceLabel / monthLabel', () => {
  it('names cadences', () => {
    expect(cadenceLabel('weekly')).toBe('weekly')
    expect(cadenceLabel('quarterly')).toBe('quarterly')
  })

  it('names the month of an ISO date without timezone slippage', () => {
    expect(monthLabel('2026-05-02')).toBe('May')
    expect(monthLabel('2026-01-31')).toBe('Jan')
  })
})
