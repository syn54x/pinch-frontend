import { describe, expect, it, vi } from 'vitest'
import type { TransactionOut } from '@/api/generated/types.gen'
import {
  exportFilename,
  transactionsToCsv,
  walkTransactionPages,
} from './register-export'

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
    created_at: '2026-07-21T12:00:00Z',
    ...overrides,
  }
}

describe('walkTransactionPages', () => {
  it('stitches pages in order, chaining each next_cursor until null', async () => {
    const pages: Record<
      string,
      { items: TransactionOut[]; next: string | null }
    > = {
      first: { items: [txn({ id: 'a' }), txn({ id: 'b' })], next: 'c2' },
      c2: { items: [txn({ id: 'c' })], next: 'c3' },
      c3: { items: [txn({ id: 'd' })], next: null },
    }
    const seen: Array<string | undefined> = []
    const fetchPage = async (cursor: string | undefined) => {
      seen.push(cursor)
      const page = pages[cursor ?? 'first']
      return { items: page.items, next_cursor: page.next }
    }

    const items = await walkTransactionPages(fetchPage)

    expect(seen).toEqual([undefined, 'c2', 'c3'])
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('exhausts on a single page whose cursor is already null', async () => {
    const items = await walkTransactionPages(async () => ({
      items: [txn({ id: 'only' })],
      next_cursor: null,
    }))
    expect(items.map((item) => item.id)).toEqual(['only'])
  })

  it('rejects the whole walk when a later page fails — never a partial set', async () => {
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<never>>()
      .mockImplementation(async (cursor) => {
        if (cursor === undefined) {
          return {
            items: [txn({ id: 'a' })],
            next_cursor: 'c2',
          } as never
        }
        throw new Error('page 2 died')
      })

    await expect(walkTransactionPages(fetchPage)).rejects.toThrow('page 2 died')
  })
})

describe('transactionsToCsv', () => {
  it('shapes rows the way the register reads them', () => {
    const csv = transactionsToCsv([
      txn({
        display_name: 'Whole Foods Market',
        category: { id: 'c1', name: 'Groceries' },
        tags: [
          { id: 'g1', name: 'food' },
          { id: 'g2', name: 'weekly' },
        ],
        notes: 'warehouse run',
      }),
      txn({
        id: 't2',
        date: '2026-07-20',
        amount_minor: 420000,
        description_raw: 'Payroll — Acme',
        pending: true,
      }),
    ])

    expect(csv.split('\r\n')).toEqual([
      'date,payee,category,tags,amount,currency,pending,notes',
      '2026-07-21,Whole Foods Market,Groceries,food weekly,-$62.40,USD,,warehouse run',
      '2026-07-20,Payroll — Acme,,,"$4,200.00",USD,pending,',
    ])
  })

  it('quotes payees containing commas (RFC 4180 via toCsv)', () => {
    const csv = transactionsToCsv([
      txn({ description_raw: 'Uber — client, visit' }),
    ])
    expect(csv).toContain('"Uber — client, visit"')
  })

  it('is just the header for an empty filtered set', () => {
    expect(transactionsToCsv([])).toBe(
      'date,payee,category,tags,amount,currency,pending,notes',
    )
  })
})

describe('exportFilename', () => {
  it('dates the file in local time', () => {
    expect(exportFilename(new Date(2026, 7, 6))).toBe(
      'pinch-register-2026-08-06.csv',
    )
    expect(exportFilename(new Date(2025, 0, 3))).toBe(
      'pinch-register-2025-01-03.csv',
    )
  })
})
