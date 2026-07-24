import { describe, expect, it } from 'vitest'
import { formatMonthDay, formatMonthYear, monthLabel } from './dates'

describe('date labels', () => {
  it('names the month of an ISO date without timezone slippage', () => {
    expect(monthLabel('2026-05-02')).toBe('May')
    expect(monthLabel('2026-01-31')).toBe('Jan')
  })

  it('formats month + day', () => {
    expect(formatMonthDay('2026-07-04')).toBe('Jul 4')
  })

  it('formats month + year for terms and chart labels', () => {
    expect(formatMonthYear('2024-03-01')).toBe('Mar 2024')
    // The last day of a month must not slip into the next/previous one.
    expect(formatMonthYear('2026-12-31')).toBe('Dec 2026')
  })
})
