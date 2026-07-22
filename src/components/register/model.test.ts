import { describe, expect, it } from 'vitest'
import type { TransactionOut } from '../../api/generated/types.gen'
import {
  activeProvenance,
  amountClass,
  categoryColorVar,
  categoryEmoji,
  dateChipLabel,
  datePresets,
  formatDayHeading,
  groupByDay,
  hasActiveFilters,
  payeeOf,
  sanitizeRegisterSearch,
  signedAmount,
  toListQuery,
  UNCATEGORIZED,
} from './model'

function txn(overrides: Partial<TransactionOut>): TransactionOut {
  return {
    id: 't1',
    account_id: 'a1',
    date: '2026-07-21',
    amount_minor: -6240,
    currency: 'USD',
    description_raw: 'WHOLEFDS #10234 AUSTIN TX',
    description_normalized: 'wholefds austin tx',
    pending: false,
    display_name: null,
    notes: null,
    reviewed_at: null,
    category: null,
    tags: [],
    proposal: null,
    splits: null,
    transfer: null,
    created_at: '2026-07-21T00:00:00Z',
    ...overrides,
  }
}

describe('sanitizeRegisterSearch', () => {
  it('keeps well-formed values and drops the rest', () => {
    expect(
      sanitizeRegisterSearch({
        q: ' netflix ',
        account: 'acc-1',
        category: UNCATEGORIZED,
        tag: 'warehouse-run',
        from: '2026-07-01',
        to: '2026-07-21',
        txn: 'txn-1',
      }),
    ).toEqual({
      q: 'netflix',
      account: 'acc-1',
      category: UNCATEGORIZED,
      tag: 'warehouse-run',
      from: '2026-07-01',
      to: '2026-07-21',
      txn: 'txn-1',
    })
  })

  it('degrades malformed input to fewer filters, never an error', () => {
    expect(
      sanitizeRegisterSearch({
        q: '',
        account: 42,
        from: 'not-a-date',
        to: '2026-7-1',
        tag: '   ',
        extra: 'ignored',
      }),
    ).toEqual({})
  })
})

describe('toListQuery', () => {
  it('maps every filter onto the listing API', () => {
    expect(
      toListQuery({
        q: 'whole',
        account: 'acc-1',
        category: 'cat-1',
        tag: 'errands',
        from: '2026-07-01',
        to: '2026-07-21',
      }),
    ).toEqual({
      q: 'whole',
      account_id: ['acc-1'],
      category_id: ['cat-1'],
      tag: ['errands'],
      date_from: '2026-07-01',
      date_to: '2026-07-21',
    })
  })

  it('translates the uncategorized sentinel, not a category id', () => {
    expect(toListQuery({ category: UNCATEGORIZED })).toEqual({
      uncategorized: true,
    })
  })

  it('sends nothing for an empty filter state', () => {
    expect(toListQuery({})).toEqual({})
  })
})

describe('hasActiveFilters', () => {
  it('counts every find-grammar field but not the selection', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ txn: 't1' })).toBe(false)
    expect(hasActiveFilters({ q: 'x' })).toBe(true)
    expect(hasActiveFilters({ from: '2026-01-01' })).toBe(true)
  })
})

describe('datePresets', () => {
  const today = new Date(2026, 6, 21) // Jul 21 2026

  it('computes calendar and rolling windows against today', () => {
    const byId = Object.fromEntries(datePresets(today).map((p) => [p.id, p]))
    expect(byId.all).toEqual({ id: 'all', label: 'All dates' })
    expect(byId['this-month']).toMatchObject({
      from: '2026-07-01',
      to: '2026-07-21',
    })
    expect(byId['last-month']).toMatchObject({
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(byId['last-90']).toMatchObject({
      from: '2026-04-22',
      to: '2026-07-21',
    })
    expect(byId['this-year']).toMatchObject({
      from: '2026-01-01',
      to: '2026-07-21',
    })
  })

  it('survives month/year boundaries', () => {
    const january = new Date(2026, 0, 3)
    const byId = Object.fromEntries(datePresets(january).map((p) => [p.id, p]))
    expect(byId['last-month']).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    })
    expect(byId['last-90']).toMatchObject({ from: '2025-10-05' })
  })

  it('labels the chip with the matching preset, else the raw range', () => {
    expect(dateChipLabel({}, today)).toBe('All dates')
    expect(dateChipLabel({ from: '2026-07-01', to: '2026-07-21' }, today)).toBe(
      'This month',
    )
    expect(dateChipLabel({ from: '2026-02-03', to: '2026-02-04' }, today)).toBe(
      '2026-02-03 – 2026-02-04',
    )
  })
})

describe('groupByDay', () => {
  it('groups a date-desc list into contiguous day sections in order', () => {
    const items = [
      txn({ id: 'a', date: '2026-07-21' }),
      txn({ id: 'b', date: '2026-07-21' }),
      txn({ id: 'c', date: '2026-07-20' }),
      txn({ id: 'd', date: '2026-07-18' }),
    ]
    expect(
      groupByDay(items).map((g) => [g.date, g.items.map((t) => t.id)]),
    ).toEqual([
      ['2026-07-21', ['a', 'b']],
      ['2026-07-20', ['c']],
      ['2026-07-18', ['d']],
    ])
  })

  it('returns nothing for nothing', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('formatDayHeading', () => {
  const today = new Date(2026, 6, 21)

  it('is month + day within the current year', () => {
    expect(formatDayHeading('2026-07-21', today)).toBe('Jul 21')
  })

  it('adds the year for other years', () => {
    expect(formatDayHeading('2025-12-31', today)).toBe('Dec 31, 2025')
  })
})

describe('amounts', () => {
  it('always carries an explicit direction sign', () => {
    expect(signedAmount(-6240, 'USD')).toBe('−$62.40')
    expect(signedAmount(420000, 'USD')).toBe('+$4,200.00')
  })

  it('colors by direction', () => {
    expect(amountClass(-1)).toBe('text-destructive')
    expect(amountClass(1)).toBe('text-success')
  })
})

describe('payeeOf', () => {
  it('prefers the display-name override, falls back to raw', () => {
    expect(payeeOf(txn({}))).toBe('WHOLEFDS #10234 AUSTIN TX')
    expect(payeeOf(txn({ display_name: 'Whole Foods Market' }))).toBe(
      'Whole Foods Market',
    )
  })
})

describe('catpill identity', () => {
  it('derives a stable color in the --cat band', () => {
    expect(categoryColorVar('Groceries')).toBe(categoryColorVar('groceries'))
    expect(categoryColorVar('Groceries')).toMatch(/^var\(--cat-(10|[1-9])\)$/)
  })

  it('matches emoji by keyword with a neutral fallback', () => {
    expect(categoryEmoji('Groceries')).toBe('🛒')
    expect(categoryEmoji('Income')).toBe('💰')
    expect(categoryEmoji('Subscriptions')).toBe('📺')
    expect(categoryEmoji('Zorp')).toBe('🏷️')
  })
})

describe('activeProvenance', () => {
  const groceries = { id: 'cat-1', name: 'Groceries' }

  it('badges the applied category when the proposal decided it', () => {
    expect(
      activeProvenance(
        txn({
          category: groceries,
          proposal: {
            category: groceries,
            tags: [],
            display_name: null,
            proposed_transfer: false,
            provenance: 'ai',
          },
        }),
      ),
    ).toBe('ai')
  })

  it('shows no lineage for user-picked or undecided categories', () => {
    expect(activeProvenance(txn({ category: groceries }))).toBeNull()
    expect(
      activeProvenance(
        txn({
          category: groceries,
          proposal: {
            category: { id: 'cat-2', name: 'Dining' },
            tags: [],
            display_name: null,
            proposed_transfer: false,
            provenance: 'rule',
          },
        }),
      ),
    ).toBeNull()
    expect(
      activeProvenance(
        txn({
          category: groceries,
          proposal: {
            category: groceries,
            tags: [],
            display_name: null,
            proposed_transfer: false,
            provenance: 'none',
          },
        }),
      ),
    ).toBeNull()
  })
})
