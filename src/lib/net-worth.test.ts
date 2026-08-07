import { describe, expect, it } from 'vitest'
import type { Delta, Projection, SeriesPoint } from '@/api/generated/types.gen'
import {
  collectingHistory,
  deltaGlyph,
  deltaTone,
  formatDeltaPercent,
  historyFraction,
  historySpanLabel,
  momReady,
  projectionReady,
  rangeWindowDays,
  showProjection,
  spanDays,
} from './net-worth'

function series(dates: string[]): SeriesPoint[] {
  return dates.map((date, i) => ({ date, net_worth_minor: i * 1000 }))
}

const PROJECTION: Projection = {
  series: [
    { date: '2026-07-01', net_worth_minor: 1000 },
    { date: '2027-07-01', net_worth_minor: 5000 },
  ],
  endpoint: { date: '2027-07-01', net_worth_minor: 5000 },
}

describe('spanDays', () => {
  it('measures last − first in days, granularity-proof', () => {
    expect(spanDays(series(['2026-07-01', '2026-07-15']))).toBe(14)
    // Monthly buckets read the same span as daily ones.
    expect(spanDays(series(['2026-01-01', '2026-07-01']))).toBe(181)
  })

  it('is 0 for an empty or single-point history', () => {
    expect(spanDays([])).toBe(0)
    expect(spanDays(series(['2026-07-01']))).toBe(0)
  })
})

describe('projectionReady (14-day gate)', () => {
  it('opens at exactly 14 days', () => {
    expect(projectionReady(series(['2026-07-01', '2026-07-15']))).toBe(true)
  })

  it('is closed below 14 days (the two-dots case)', () => {
    expect(projectionReady(series(['2026-07-19', '2026-07-21']))).toBe(false)
    expect(projectionReady(series(['2026-07-21']))).toBe(false)
    expect(projectionReady([])).toBe(false)
  })
})

describe('showProjection', () => {
  const long = series(['2026-07-01', '2026-07-20'])
  const short = series(['2026-07-19', '2026-07-21'])

  it('draws only when there is both a server projection and enough history', () => {
    expect(showProjection(long, PROJECTION)).toBe(true)
  })

  it('withholds when history is too short even if the server sent one', () => {
    expect(showProjection(short, PROJECTION)).toBe(false)
  })

  it('withholds when the server sent no projection', () => {
    expect(showProjection(long, null)).toBe(false)
  })
})

describe('collectingHistory (60-day gate, wireframe 3b)', () => {
  it('is collecting under 60 days of span, including a single point', () => {
    expect(collectingHistory(series(['2026-07-21']), '6m')).toBe(true)
    expect(collectingHistory(series(['2026-06-01', '2026-07-25']), '6m')).toBe(
      true,
    )
    // "All" on six weeks is exactly the case the state exists for (3b).
    expect(collectingHistory(series(['2026-06-09', '2026-07-21']), 'all')).toBe(
      true,
    )
  })

  it('opens at 60 days', () => {
    expect(collectingHistory(series(['2026-05-01', '2026-06-30']), '6m')).toBe(
      false,
    )
    expect(collectingHistory(series(['2026-01-01', '2026-07-01']), '1y')).toBe(
      false,
    )
  })

  it('caps at the range window: a fully covered month is not collecting', () => {
    // 30 days of span < 60, but they are the whole 1M window (threshold 27).
    expect(collectingHistory(series(['2026-06-21', '2026-07-21']), '1m')).toBe(
      false,
    )
    // A few days of the month still is collecting.
    expect(collectingHistory(series(['2026-07-18', '2026-07-21']), '1m')).toBe(
      true,
    )
  })

  it('an empty history is not "collecting" — that is the empty state', () => {
    expect(collectingHistory([], '6m')).toBe(false)
  })
})

describe('historyFraction / rangeWindowDays', () => {
  it('floors "all" at a year — six weeks never dresses up as the whole axis', () => {
    expect(rangeWindowDays('all')).toBe(365)
    expect(rangeWindowDays('1y')).toBe(365)
    expect(rangeWindowDays('1m')).toBe(30)
  })

  it('is the span share of the window, clamped to [0.15, 1]', () => {
    // 42 days of 365 ≈ 0.115 → floored to 0.15.
    expect(historyFraction(series(['2026-06-01', '2026-07-13']), 'all')).toBe(
      0.15,
    )
    // 15 of 30 days = half the month window.
    expect(
      historyFraction(series(['2026-07-01', '2026-07-16']), '1m'),
    ).toBeCloseTo(0.5)
    // More history than window: never overflows past 1.
    expect(historyFraction(series(['2026-06-01', '2026-07-16']), '1m')).toBe(1)
  })
})

describe('historySpanLabel', () => {
  it('counts days under two weeks, whole weeks after', () => {
    expect(historySpanLabel(series(['2026-07-21']))).toBe('0 days of history')
    expect(historySpanLabel(series(['2026-07-18', '2026-07-21']))).toBe(
      '3 days of history',
    )
    expect(historySpanLabel(series(['2026-06-09', '2026-07-21']))).toBe(
      '6 weeks of history',
    )
  })
})

describe('momReady (month-coverage gate)', () => {
  const now = new Date('2026-07-23T12:00:00Z')

  it('is ready when history reaches back before the current month', () => {
    expect(momReady(series(['2026-06-15', '2026-07-20']), now)).toBe(true)
    // The 1st itself counts — it is not "after" the start of the month.
    expect(momReady(series(['2026-07-01', '2026-07-20']), now)).toBe(true)
  })

  it('is not ready when all history sits inside the current month', () => {
    expect(momReady(series(['2026-07-10', '2026-07-20']), now)).toBe(false)
  })

  it('is not ready with no history', () => {
    expect(momReady([], now)).toBe(false)
  })
})

describe('delta presentation', () => {
  it('tones a signed change', () => {
    expect(deltaTone(6740)).toBe('positive')
    expect(deltaTone(-1480)).toBe('negative')
    expect(deltaTone(0)).toBe('muted')
  })

  it('picks the direction glyph', () => {
    expect(deltaGlyph(6740)).toBe('▲')
    expect(deltaGlyph(-1480)).toBe('▼')
    expect(deltaGlyph(0)).toBe('·')
  })

  it('formats percent as an absolute one-decimal string', () => {
    expect(formatDeltaPercent({ delta_minor: 3240000, percent: 12.9 })).toBe(
      '12.9%',
    )
    expect(formatDeltaPercent({ delta_minor: -500, percent: -4.25 })).toBe(
      '4.3%',
    )
  })

  it('returns null percent when the reference was zero', () => {
    const delta: Delta = { delta_minor: 1000, percent: null }
    expect(formatDeltaPercent(delta)).toBeNull()
  })
})
