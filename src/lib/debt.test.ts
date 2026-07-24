import { describe, expect, it } from 'vitest'
import {
  addMonths,
  deriveMaturity,
  deriveTermMonths,
  formatMonthInput,
  monthsBetween,
  parseMonthInput,
} from './debt'

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths('2024-03-01', 60)).toBe('2029-03-01')
    expect(addMonths('2024-03-15', 1)).toBe('2024-04-15')
  })

  it('rolls the year over', () => {
    expect(addMonths('2024-11-01', 3)).toBe('2025-02-01')
  })

  it('clamps the day to the target month length', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29') // leap
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
  })
})

describe('monthsBetween', () => {
  it('counts calendar months', () => {
    expect(monthsBetween('2024-03-01', '2029-03-01')).toBe(60)
    expect(monthsBetween('2024-01-01', '2024-04-01')).toBe(3)
  })
})

describe('term ↔ maturity round-trip', () => {
  it('folds Opened + Term into maturity, and recovers Term', () => {
    const opened = '2024-03-01'
    const maturity = deriveMaturity(opened, 60)
    expect(maturity).toBe('2029-03-01')
    expect(deriveTermMonths(opened, maturity)).toBe(60)
  })

  it('has no term when either date is missing', () => {
    expect(deriveTermMonths(null, '2029-03-01')).toBeNull()
    expect(deriveTermMonths('2024-03-01', null)).toBeNull()
  })
})

describe('parseMonthInput', () => {
  it('parses MM/YYYY (with or without spaces) to first-of-month', () => {
    expect(parseMonthInput('03/2024')).toBe('2024-03-01')
    expect(parseMonthInput('3 / 2024')).toBe('2024-03-01')
  })

  it('accepts an ISO month too', () => {
    expect(parseMonthInput('2024-03')).toBe('2024-03-01')
    expect(parseMonthInput('2024-03-15')).toBe('2024-03-01')
  })

  it('drops empties and nonsense (the field is optional)', () => {
    expect(parseMonthInput('')).toBeNull()
    expect(parseMonthInput('   ')).toBeNull()
    expect(parseMonthInput('13/2024')).toBeNull()
    expect(parseMonthInput('March')).toBeNull()
  })
})

describe('formatMonthInput', () => {
  it('renders ISO first-of-month back as MM/YYYY', () => {
    expect(formatMonthInput('2024-03-01')).toBe('03/2024')
    expect(formatMonthInput(null)).toBe('')
  })
})
