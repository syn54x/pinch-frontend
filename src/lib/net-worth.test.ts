import { describe, expect, it } from 'vitest'
import type { Delta, Projection, SeriesPoint } from '@/api/generated/types.gen'
import {
  deltaGlyph,
  deltaTone,
  formatDeltaPercent,
  momReady,
  projectionReady,
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
