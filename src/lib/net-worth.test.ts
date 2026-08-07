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
  observedSeries,
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

/** Points with explicit values — the server zero-pads fixed ranges to their
 * window, so the observed-slice functions need value-bearing fixtures. */
function valued(points: [string, number][]): SeriesPoint[] {
  return points.map(([date, net_worth_minor]) => ({ date, net_worth_minor }))
}

describe('observedSeries (server zero-padding trimmed)', () => {
  it('drops the padded leading zeros, keeping from the first observation', () => {
    expect(
      observedSeries(
        valued([
          ['2026-02-01', 0],
          ['2026-05-01', 0],
          ['2026-07-20', 500],
          ['2026-07-27', 600],
        ]),
      ),
    ).toEqual(
      valued([
        ['2026-07-20', 500],
        ['2026-07-27', 600],
      ]),
    )
  })

  it('leaves an unpadded or all-zero series unchanged', () => {
    const unpadded = valued([
      ['2026-07-20', 500],
      ['2026-07-27', 0],
    ])
    expect(observedSeries(unpadded)).toEqual(unpadded)
    // All zeros: padding and a genuinely zero ledger are indistinguishable —
    // don't invent a "collecting" claim.
    const zeros = valued([
      ['2026-02-01', 0],
      ['2026-07-27', 0],
    ])
    expect(observedSeries(zeros)).toEqual(zeros)
    expect(observedSeries([])).toEqual([])
  })
})

describe('collectingHistory (60-day observed gate, wireframe 3b)', () => {
  it('is collecting under 60 observed days, including a single point', () => {
    expect(collectingHistory(valued([['2026-07-21', 100]]), '6m')).toBe(true)
    expect(
      collectingHistory(
        valued([
          ['2026-06-01', 100],
          ['2026-07-25', 200],
        ]),
        '6m',
      ),
    ).toBe(true)
    // "All" on six weeks is exactly the case the state exists for (3b).
    expect(
      collectingHistory(
        valued([
          ['2026-06-09', 100],
          ['2026-07-21', 200],
        ]),
        'all',
      ),
    ).toBe(true)
  })

  it('sees through the window padding: a padded 6m series with one real week is collecting', () => {
    expect(
      collectingHistory(
        valued([
          ['2026-02-01', 0],
          ['2026-04-01', 0],
          ['2026-07-20', 500],
          ['2026-07-27', 600],
        ]),
        '6m',
      ),
    ).toBe(true)
  })

  it('opens at 60 observed days', () => {
    expect(
      collectingHistory(
        valued([
          ['2026-05-01', 100],
          ['2026-06-30', 200],
        ]),
        '6m',
      ),
    ).toBe(false)
    expect(
      collectingHistory(
        valued([
          ['2026-01-01', 100],
          ['2026-07-01', 200],
        ]),
        '1y',
      ),
    ).toBe(false)
  })

  it('caps at the range window: a fully covered month is not collecting', () => {
    // 30 days of span < 60, but they are the whole 1M window (threshold 27).
    expect(
      collectingHistory(
        valued([
          ['2026-06-21', 100],
          ['2026-07-21', 200],
        ]),
        '1m',
      ),
    ).toBe(false)
    // A few days of the month still is collecting.
    expect(
      collectingHistory(
        valued([
          ['2026-07-18', 100],
          ['2026-07-21', 200],
        ]),
        '1m',
      ),
    ).toBe(true)
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

  it('is the observed share of the window, clamped to [0.15, 1]', () => {
    // 42 observed days of 365 ≈ 0.115 → floored to 0.15.
    expect(
      historyFraction(
        valued([
          ['2026-06-01', 100],
          ['2026-07-13', 200],
        ]),
        'all',
      ),
    ).toBe(0.15)
    // 15 of 30 days = half the month window, padded zeros excluded.
    expect(
      historyFraction(
        valued([
          ['2026-06-16', 0],
          ['2026-07-01', 100],
          ['2026-07-16', 200],
        ]),
        '1m',
      ),
    ).toBeCloseTo(0.5)
    // More history than window: never overflows past 1.
    expect(
      historyFraction(
        valued([
          ['2026-06-01', 100],
          ['2026-07-16', 200],
        ]),
        '1m',
      ),
    ).toBe(1)
  })
})

describe('historySpanLabel', () => {
  it('says "first day", then days, then whole weeks — observed span only', () => {
    expect(historySpanLabel(valued([['2026-07-21', 100]]))).toBe(
      'first day of history',
    )
    expect(
      historySpanLabel(
        valued([
          ['2026-07-18', 100],
          ['2026-07-21', 200],
        ]),
      ),
    ).toBe('3 days of history')
    expect(
      historySpanLabel(
        valued([
          ['2026-02-01', 0],
          ['2026-06-09', 100],
          ['2026-07-21', 200],
        ]),
      ),
    ).toBe('6 weeks of history')
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
