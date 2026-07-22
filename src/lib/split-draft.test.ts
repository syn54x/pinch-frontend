import { describe, expect, it } from 'vitest'
import type { TransactionOut } from '@/api/generated/types.gen'
import {
  formatAmountInput,
  initialSplitDraft,
  parseAmountInput,
  type SplitDraftLine,
  splitStatus,
  splitsForReview,
} from './split-draft'

// The wireframe's Costco anchor: −$214.90 with an ai Groceries proposal.
const COSTCO = {
  id: 'txn-costco',
  amount_minor: -21490,
  currency: 'USD',
  proposal: {
    category: { id: 'cat-groceries', name: 'Groceries' },
    tags: [],
    display_name: null,
    proposed_transfer: false,
    provenance: 'ai',
  },
} as unknown as TransactionOut

function line(
  amountInput: string,
  category: SplitDraftLine['category'] = null,
): SplitDraftLine {
  return { amountInput, category, provenance: 'none' }
}

describe('parseAmountInput', () => {
  it('parses magnitudes by string, never floats', () => {
    expect(parseAmountInput('164.90', 'USD')).toBe(16490)
    expect(parseAmountInput('50', 'USD')).toBe(5000)
    expect(parseAmountInput('0.07', 'USD')).toBe(7)
    expect(parseAmountInput('1,234.56', 'USD')).toBe(123456)
    expect(parseAmountInput('$12.5', 'USD')).toBe(1250)
  })

  it('respects the currency exponent (0 for JPY)', () => {
    expect(parseAmountInput('1200', 'JPY')).toBe(1200)
    expect(parseAmountInput('12.5', 'JPY')).toBeNull()
  })

  it('rejects the unusable: empty, malformed, zero, over-precise', () => {
    expect(parseAmountInput('', 'USD')).toBeNull()
    expect(parseAmountInput('abc', 'USD')).toBeNull()
    expect(parseAmountInput('-50', 'USD')).toBeNull()
    expect(parseAmountInput('0', 'USD')).toBeNull()
    expect(parseAmountInput('0.00', 'USD')).toBeNull()
    expect(parseAmountInput('1.999', 'USD')).toBeNull()
  })

  it('round-trips with formatAmountInput', () => {
    expect(formatAmountInput(21490, 'USD')).toBe('214.90')
    expect(parseAmountInput(formatAmountInput(21490, 'USD'), 'USD')).toBe(21490)
    expect(formatAmountInput(7, 'USD')).toBe('0.07')
  })
})

describe('initialSplitDraft', () => {
  it('inherits the proposal onto line 1 (category, provenance, whole amount) plus one empty line', () => {
    const lines = initialSplitDraft(COSTCO)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      amountInput: '214.90',
      category: { id: 'cat-groceries', name: 'Groceries' },
      provenance: 'ai',
    })
    expect(lines[1]).toEqual({
      amountInput: '',
      category: null,
      provenance: 'none',
    })
  })

  it('an uncategorized anchor opens with an uncategorized none line', () => {
    const bare = { ...COSTCO, proposal: null } as TransactionOut
    const lines = initialSplitDraft(bare)
    expect(lines[0].category).toBeNull()
    expect(lines[0].provenance).toBe('none')
  })
})

describe('splitStatus — the lines-vs-total guard', () => {
  it('valid when every line parses and the signed sum matches exactly', () => {
    const status = splitStatus([line('164.90'), line('50.00')], COSTCO)
    expect(status).toEqual({
      linesTotalMinor: -21490,
      complete: true,
      valid: true,
    })
  })

  it('a mismatch blocks: complete but not valid', () => {
    const status = splitStatus([line('164.90'), line('40.00')], COSTCO)
    expect(status.complete).toBe(true)
    expect(status.valid).toBe(false)
    expect(status.linesTotalMinor).toBe(-20490)
  })

  it('an empty or unparseable line blocks as incomplete', () => {
    expect(splitStatus([line('214.90'), line('')], COSTCO).complete).toBe(false)
    expect(splitStatus([line('214.90'), line('')], COSTCO).valid).toBe(false)
  })

  it('a single line never validates — a split is at least two', () => {
    expect(splitStatus([line('214.90')], COSTCO).valid).toBe(false)
  })

  it('a positive parent sums positive lines', () => {
    const payroll = { ...COSTCO, amount_minor: 420000 } as TransactionOut
    const status = splitStatus([line('4000'), line('200')], payroll)
    expect(status).toEqual({
      linesTotalMinor: 420000,
      complete: true,
      valid: true,
    })
  })
})

describe('splitsForReview', () => {
  it('emits parent-signed minor units with the lines’ category ids', () => {
    const lines = [
      line('164.90', { id: 'cat-groceries', name: 'Groceries' }),
      line('50.00', { id: 'cat-household', name: 'Household' }),
    ]
    expect(splitsForReview(lines, COSTCO)).toEqual([
      { amount_minor: -16490, category_id: 'cat-groceries' },
      { amount_minor: -5000, category_id: 'cat-household' },
    ])
  })

  it('an uncategorized line rides as category_id null — a legal line', () => {
    expect(splitsForReview([line('214.90')], COSTCO)[0]).toEqual({
      amount_minor: -21490,
      category_id: null,
    })
  })
})
