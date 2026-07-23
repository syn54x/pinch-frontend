import { describe, expect, it } from 'vitest'
import {
  abbreviateNumber,
  formatCompactMinorUnits,
  formatPercent,
  niceDomain,
  niceTicks,
} from './chart-scale'

describe('niceTicks', () => {
  it('produces evenly spaced round ticks enclosing the range', () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('snaps a ragged range out to nice boundaries', () => {
    expect(niceTicks(3, 97)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('is order-independent (min/max may arrive swapped)', () => {
    expect(niceTicks(100, 0)).toEqual(niceTicks(0, 100))
  })

  it('spans negative-to-positive ranges through zero', () => {
    expect(niceTicks(-50, 50)).toEqual([-60, -40, -20, 0, 20, 40, 60])
  })

  it('keeps fractional steps free of float drift', () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('returns a single tick for a degenerate range', () => {
    expect(niceTicks(5, 5)).toEqual([5])
  })
})

describe('niceDomain', () => {
  it('returns the enclosing nice bounds', () => {
    expect(niceDomain(3, 97)).toEqual([0, 100])
    expect(niceDomain(-50, 50)).toEqual([-60, 60])
  })

  it('collapses a degenerate range to a point', () => {
    expect(niceDomain(42, 42)).toEqual([42, 42])
  })
})

// Intl formatting is locale-sensitive; assert the stable core (digits, symbol,
// suffix) rather than exact punctuation so these hold across en-* runtimes.
describe('abbreviateNumber', () => {
  it('compacts thousands and millions', () => {
    expect(abbreviateNumber(1234)).toMatch(/1\.2K/i)
    expect(abbreviateNumber(1_500_000)).toMatch(/1\.5M/i)
  })

  it('leaves small numbers whole', () => {
    expect(abbreviateNumber(42)).toBe('42')
  })
})

describe('formatCompactMinorUnits', () => {
  it('scales USD minor units to a compact currency label', () => {
    // 4_000_000 cents = $40,000 → "$40K"
    const label = formatCompactMinorUnits(4_000_000, 'USD')
    expect(label).toContain('$')
    expect(label).toMatch(/40K/i)
  })

  it('honors zero-decimal currencies (JPY has no minor unit)', () => {
    // 40000 yen minor units = ¥40,000 → "¥40K"
    expect(formatCompactMinorUnits(40_000, 'JPY')).toMatch(/40K/i)
  })
})

describe('formatPercent', () => {
  it('formats a 0..1 fraction', () => {
    expect(formatPercent(0.34)).toBe('34%')
  })

  it('rounds to whole percents by default', () => {
    expect(formatPercent(0.128)).toBe('13%')
  })
})
