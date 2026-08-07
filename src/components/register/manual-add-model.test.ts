import { describe, expect, it } from 'vitest'
import {
  minorUnitDigits,
  parseAmountToMinor,
  signedMinor,
  todayIso,
} from './manual-add-model'

describe('minorUnitDigits', () => {
  it('reads the exponent from CLDR, no table', () => {
    expect(minorUnitDigits('USD')).toBe(2)
    expect(minorUnitDigits('JPY')).toBe(0)
    expect(minorUnitDigits('BHD')).toBe(3)
  })
})

describe('parseAmountToMinor', () => {
  it('parses plain and decorated magnitudes to minor units', () => {
    expect(parseAmountToMinor('24', 'USD')).toBe(2400)
    expect(parseAmountToMinor('24.5', 'USD')).toBe(2450)
    expect(parseAmountToMinor('24.05', 'USD')).toBe(2405)
    expect(parseAmountToMinor('$1,234.56', 'USD')).toBe(123456)
    expect(parseAmountToMinor(' 24.00 ', 'USD')).toBe(2400)
    // A trailing dot mid-typing is still a valid whole amount.
    expect(parseAmountToMinor('24.', 'USD')).toBe(2400)
  })

  it('respects the currency exponent', () => {
    expect(parseAmountToMinor('500', 'JPY')).toBe(500)
    expect(parseAmountToMinor('1.234', 'BHD')).toBe(1234)
    // More fraction digits than the currency has is a rejection, never a
    // silent rounding.
    expect(parseAmountToMinor('24.005', 'USD')).toBeNull()
    expect(parseAmountToMinor('500.5', 'JPY')).toBeNull()
  })

  it('rejects non-amounts, signs, zero, and out-of-range', () => {
    expect(parseAmountToMinor('', 'USD')).toBeNull()
    expect(parseAmountToMinor('abc', 'USD')).toBeNull()
    expect(parseAmountToMinor('12a', 'USD')).toBeNull()
    // The sign belongs to the Expense/Income selector.
    expect(parseAmountToMinor('-24', 'USD')).toBeNull()
    expect(parseAmountToMinor('+24', 'USD')).toBeNull()
    expect(parseAmountToMinor('0', 'USD')).toBeNull()
    expect(parseAmountToMinor('0.00', 'USD')).toBeNull()
    // int4 bound: 21474836.47 USD is the ceiling; one cent past is invalid.
    expect(parseAmountToMinor('21474836.47', 'USD')).toBe(2_147_483_647)
    expect(parseAmountToMinor('21474836.48', 'USD')).toBeNull()
  })
})

describe('signedMinor', () => {
  it('expense is money out, income money in', () => {
    expect(signedMinor(2400, 'expense')).toBe(-2400)
    expect(signedMinor(2400, 'income')).toBe(2400)
  })
})

describe('todayIso', () => {
  it('formats local-time ISO dates, zero-padded', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayIso(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
