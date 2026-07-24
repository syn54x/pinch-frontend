import { describe, expect, it } from 'vitest'
import type { TransactionOut } from '@/api/generated/types.gen'
import { consumesCounterpart, transferCandidates } from './reviewer-model'

function txn(overrides: Partial<TransactionOut>): TransactionOut {
  return {
    id: 't1',
    account_id: 'acc-1',
    date: '2026-07-20',
    amount_minor: -12000,
    currency: 'USD',
    description_raw: 'VENMO PAYMENT',
    description_normalized: 'venmo payment',
    pending: false,
    display_name: null,
    notes: null,
    reviewed_at: null,
    category: null,
    tags: [],
    proposal: null,
    splits: null,
    transfer: null,
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

describe('transferCandidates', () => {
  const outflow = txn({ id: 'out', account_id: 'checking' })

  it('offers only what the backend would link: equal magnitude, opposite sign, same currency, different account', () => {
    const match = txn({ id: 'in', account_id: 'savings', amount_minor: 12000 })
    const queue = [
      outflow, // the row itself — never its own counterpart
      match,
      txn({ id: 'same-sign', account_id: 'savings', amount_minor: -12000 }),
      txn({ id: 'off-by-one', account_id: 'savings', amount_minor: 11999 }),
      txn({
        id: 'other-currency',
        account_id: 'savings',
        amount_minor: 12000,
        currency: 'EUR',
      }),
      txn({ id: 'same-account', account_id: 'checking', amount_minor: 12000 }),
    ]
    expect(transferCandidates(outflow, queue).map((t) => t.id)).toEqual(['in'])
  })

  it('excludes rows the backend would 409: split members and occupied transfers', () => {
    const queue = [
      txn({
        id: 'split',
        account_id: 'savings',
        amount_minor: 12000,
        splits: [{ amount_minor: 12000, category: null, memo: null }],
      }),
      txn({
        id: 'occupied',
        account_id: 'savings',
        amount_minor: 12000,
        transfer: {
          id: 'tr1',
          kind: 'untracked',
          counterpart_transaction_id: null,
          counterpart_account_id: null,
        },
      }),
    ]
    expect(transferCandidates(outflow, queue)).toEqual([])
  })

  it('sorts by date proximity to the focused row', () => {
    const near = txn({
      id: 'near',
      account_id: 'savings',
      amount_minor: 12000,
      date: '2026-07-21',
    })
    const far = txn({
      id: 'far',
      account_id: 'brokerage',
      amount_minor: 12000,
      date: '2026-07-01',
    })
    expect(transferCandidates(outflow, [far, near]).map((t) => t.id)).toEqual([
      'near',
      'far',
    ])
  })
})

describe('consumesCounterpart', () => {
  const proposalPair = txn({
    id: 'out',
    proposal: {
      category: null,
      display_name: null,
      tags: [],
      provenance: 'detection',
      proposed_transfer: true,
      counterpart_transaction_id: 'mirror',
    },
  })

  it('consent (null body) on a detected pair consumes the proposed mirror', () => {
    expect(consumesCounterpart(proposalPair, null)).toBe('mirror')
  })

  it('an explicit counterpart decision consumes that row — proposal or not', () => {
    expect(
      consumesCounterpart(txn({ id: 'out' }), {
        transfer: { counterpart: 'picked' },
      }),
    ).toBe('picked')
    expect(
      consumesCounterpart(proposalPair, {
        transfer: { counterpart: 'picked' },
      }),
    ).toBe('picked')
  })

  it('an untracked decision reviews one side only', () => {
    expect(
      consumesCounterpart(txn({ id: 'out' }), {
        transfer: { untracked: true },
      }),
    ).toBeNull()
    expect(
      consumesCounterpart(proposalPair, { transfer: { untracked: true } }),
    ).toBeNull()
  })

  it('a category decision is the decline — one side, mirror withdrawn', () => {
    expect(consumesCounterpart(proposalPair, { category_id: 'cat' })).toBeNull()
  })
})
