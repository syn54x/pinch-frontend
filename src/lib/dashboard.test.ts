import { describe, expect, it } from 'vitest'
import type { DaySpending, UpcomingBill } from '@/api/generated/types.gen'
import {
  billsSummary,
  dayIndexOf,
  greeting,
  provenanceSplit,
  queuePosition,
  sparkValues,
} from './dashboard'

function at(hour: number): Date {
  return new Date(2026, 6, 21, hour, 30)
}

describe('greeting', () => {
  it('speaks by time of day', () => {
    expect(greeting(at(6))).toBe('Good morning')
    expect(greeting(at(11))).toBe('Good morning')
    expect(greeting(at(12))).toBe('Good afternoon')
    expect(greeting(at(17))).toBe('Good afternoon')
    expect(greeting(at(18))).toBe('Good evening')
    expect(greeting(at(23))).toBe('Good evening')
  })
})

describe('provenanceSplit', () => {
  it('keeps ai/rule/history in order and drops empty buckets', () => {
    expect(provenanceSplit({ ai: 7, rule: 3, history: 2 })).toEqual([
      { key: 'ai', count: 7 },
      { key: 'rule', count: 3 },
      { key: 'history', count: 2 },
    ])
  })

  it('omits zero and absent buckets, and ignores unknown keys', () => {
    expect(provenanceSplit({ ai: 4, rule: 0, detection: 9 })).toEqual([
      { key: 'ai', count: 4 },
    ])
    expect(provenanceSplit({})).toEqual([])
  })
})

describe('billsSummary', () => {
  const bill = (display_name: string): UpcomingBill => ({
    display_name,
    due_date: '2026-07-25',
    amount_minor: 1000,
  })

  it('lists the first three payees then "+N" for the rest', () => {
    expect(
      billsSummary(['Rent', 'Netflix', 'PG&E', 'Spotify', 'Gym'].map(bill)),
    ).toBe('Rent, Netflix, PG&E +2')
  })

  it('shows every name when three or fewer, and nothing when empty', () => {
    expect(billsSummary(['Rent', 'Netflix'].map(bill))).toBe('Rent, Netflix')
    expect(billsSummary([])).toBe('')
  })
})

describe('sparkValues', () => {
  it('maps day totals to magnitudes', () => {
    const days: DaySpending[] = [
      { date: '2026-07-01', total_minor: -1200 },
      { date: '2026-07-02', total_minor: 800 },
      { date: '2026-07-03', total_minor: 0 },
    ]
    expect(sparkValues(days)).toEqual([1200, 800, 0])
  })
})

describe('queuePosition', () => {
  const ids = ['a', 'b', 'c']

  it('reports 1-based position and total in day-then-row order', () => {
    expect(queuePosition(ids, 'a')).toEqual({ position: 1, total: 3 })
    expect(queuePosition(ids, 'c')).toEqual({ position: 3, total: 3 })
  })

  it('reports position 0 when nothing is focused or the row has left', () => {
    expect(queuePosition(ids, null)).toEqual({ position: 0, total: 3 })
    expect(queuePosition(ids, 'gone')).toEqual({ position: 0, total: 3 })
    expect(queuePosition([], null)).toEqual({ position: 0, total: 0 })
  })
})

describe('dayIndexOf', () => {
  const groups = [
    { date: '2026-07-21', rows: [{ id: 'a' }, { id: 'b' }] },
    { date: '2026-07-20', rows: [{ id: 'c' }] },
  ]

  it('finds the day group a row lives in — the pane the drawer syncs to', () => {
    expect(dayIndexOf(groups, 'a')).toBe(0)
    expect(dayIndexOf(groups, 'c')).toBe(1)
  })

  it('is -1 for an absent or null row', () => {
    expect(dayIndexOf(groups, 'gone')).toBe(-1)
    expect(dayIndexOf(groups, null)).toBe(-1)
  })
})
