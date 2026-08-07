import { describe, expect, it } from 'vitest'
import type { ImportRowOut, MappingSpec } from '../../api/generated/types.gen'
import {
  buildMappingSpec,
  commitPayload,
  completionMessage,
  countDuplicateRows,
  countIncludedRows,
  deriveColumnPreview,
  type MappingDraft,
  mappingSummaryLines,
  newlyUncategorized,
  rolesFromMapping,
  rowIsValid,
} from './import-model'

function spec(overrides: Partial<MappingSpec> = {}): MappingSpec {
  return {
    delimiter: ',',
    has_header: true,
    date_column: 0,
    date_format: '%Y-%m-%d',
    amount_column: 2,
    debit_column: null,
    credit_column: null,
    sign: 'negative_out',
    description_columns: [1],
    ...overrides,
  }
}

function row(overrides: Partial<ImportRowOut> = {}): ImportRowOut {
  return {
    id: 'r1',
    row_index: 0,
    raw_cells: ['2026-01-05', 'COFFEE SHOP', '-4.50'],
    date: '2026-01-05',
    amount_minor: -450,
    currency: 'USD',
    description_raw: 'COFFEE SHOP',
    duplicate: false,
    errors: [],
    ...overrides,
  }
}

function draft(overrides: Partial<MappingDraft> = {}): MappingDraft {
  return {
    delimiter: ',',
    hasHeader: true,
    dateFormat: '%Y-%m-%d',
    sign: 'negative_out',
    roles: ['date', 'payee', 'amount'],
    ...overrides,
  }
}

describe('rolesFromMapping', () => {
  it('reads a single-amount spec into one role per column', () => {
    expect(rolesFromMapping(spec(), 3)).toEqual(['date', 'payee', 'amount'])
  })

  it('reads a debit/credit pair', () => {
    const roles = rolesFromMapping(
      spec({ amount_column: null, debit_column: 2, credit_column: 3 }),
      4,
    )
    expect(roles).toEqual(['date', 'payee', 'debit', 'credit'])
  })

  it('assigns payee to every description column, and skip elsewhere', () => {
    const roles = rolesFromMapping(
      spec({ description_columns: [1, 3], date_column: 0, amount_column: 2 }),
      4,
    )
    expect(roles).toEqual(['date', 'payee', 'amount', 'payee'])
  })

  it('ignores an out-of-range index rather than throwing', () => {
    expect(rolesFromMapping(spec({ date_column: 9 }), 3)).toEqual([
      'skip',
      'payee',
      'amount',
    ])
  })
})

describe('deriveColumnPreview', () => {
  const csv = 'Date,Description,Amount\n2026-01-05,COFFEE SHOP,-4.50\n'

  it('reads the header and first data row on the given delimiter', () => {
    expect(deriveColumnPreview(csv, ',', true)).toEqual({
      headerRow: ['Date', 'Description', 'Amount'],
      sampleRow: ['2026-01-05', 'COFFEE SHOP', '-4.50'],
      columnCount: 3,
    })
  })

  it('treats the first record as data, not a header, when hasHeader is false', () => {
    expect(deriveColumnPreview(csv, ',', false)).toEqual({
      headerRow: null,
      sampleRow: ['Date', 'Description', 'Amount'],
      columnCount: 3,
    })
  })

  it('reshapes the column count when the delimiter changes — the whole point of the control', () => {
    // Comma-delimited text read as one semicolon-delimited column: a
    // mis-sniffed shape, and exactly the case the delimiter select exists
    // to correct.
    expect(deriveColumnPreview(csv, ';', true)).toEqual({
      headerRow: ['Date,Description,Amount'],
      sampleRow: ['2026-01-05,COFFEE SHOP,-4.50'],
      columnCount: 1,
    })
  })

  it('floors columnCount at one for an empty file', () => {
    expect(deriveColumnPreview('', ',', true)).toEqual({
      headerRow: null,
      sampleRow: null,
      columnCount: 1,
    })
  })
})

describe('buildMappingSpec', () => {
  it('builds a valid single-amount spec', () => {
    const result = buildMappingSpec(draft())
    expect(result).toEqual({
      ok: true,
      spec: {
        delimiter: ',',
        has_header: true,
        date_column: 0,
        date_format: '%Y-%m-%d',
        amount_column: 2,
        debit_column: null,
        credit_column: null,
        sign: 'negative_out',
        description_columns: [1],
      },
    })
  })

  it('builds a valid debit/credit pair spec', () => {
    const result = buildMappingSpec(
      draft({ roles: ['date', 'payee', 'debit', 'credit'] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.amount_column).toBeNull()
      expect(result.spec.debit_column).toBe(2)
      expect(result.spec.credit_column).toBe(3)
    }
  })

  it('joins multiple payee columns in column order', () => {
    const result = buildMappingSpec(
      draft({ roles: ['date', 'payee', 'amount', 'payee'] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.description_columns).toEqual([1, 3])
  })

  it('rejects zero or multiple Date columns', () => {
    expect(buildMappingSpec(draft({ roles: ['payee', 'amount'] }))).toEqual({
      ok: false,
      error: 'Pick exactly one column as Date.',
    })
    expect(
      buildMappingSpec(draft({ roles: ['date', 'date', 'amount'] })),
    ).toEqual({ ok: false, error: 'Pick exactly one column as Date.' })
  })

  it('rejects neither an Amount column nor a Debit/Credit pair', () => {
    expect(buildMappingSpec(draft({ roles: ['date', 'payee'] }))).toEqual({
      ok: false,
      error: 'Pick one Amount column, or a Debit and Credit column pair.',
    })
  })

  it('rejects both an Amount column and a Debit/Credit pair at once', () => {
    expect(
      buildMappingSpec(draft({ roles: ['date', 'amount', 'debit', 'credit'] })),
    ).toEqual({
      ok: false,
      error: 'Pick one Amount column, or a Debit and Credit column pair.',
    })
  })

  it('rejects a half pair (debit without credit or vice versa)', () => {
    expect(buildMappingSpec(draft({ roles: ['date', 'debit'] }))).toEqual({
      ok: false,
      error: 'Debit and Credit must be picked together.',
    })
  })

  it('rejects a blank date format', () => {
    expect(buildMappingSpec(draft({ dateFormat: '  ' }))).toEqual({
      ok: false,
      error: 'A date format is required.',
    })
  })
})

describe('mappingSummaryLines', () => {
  it('names columns by header when available', () => {
    expect(
      mappingSummaryLines(spec(), ['Date', 'Description', 'Amount']),
    ).toEqual([
      'Date → Date',
      'Payee → Description',
      'Amount → Amount (negative = money out)',
    ])
  })

  it('falls back to positional labels without a header', () => {
    expect(mappingSummaryLines(spec(), null)).toEqual([
      'Date → Column 1',
      'Payee → Column 2',
      'Amount → Column 3 (negative = money out)',
    ])
  })

  it('flips the sign note for positive_out', () => {
    const lines = mappingSummaryLines(spec({ sign: 'positive_out' }), null)
    expect(lines).toContain('Amount → Column 3 (positive = money out)')
  })

  it('describes a debit/credit pair', () => {
    const lines = mappingSummaryLines(
      spec({ amount_column: null, debit_column: 2, credit_column: 3 }),
      ['Date', 'Memo', 'Debit', 'Credit'],
    )
    expect(lines).toContain('Debit → Debit, Credit → Credit')
  })

  it('omits the payee line when no column is mapped to it', () => {
    expect(
      mappingSummaryLines(spec({ description_columns: [] }), null),
    ).toEqual(['Date → Column 1', 'Amount → Column 3 (negative = money out)'])
  })
})

describe('rowIsValid / countIncludedRows / countDuplicateRows', () => {
  const rows = [
    row({ id: 'clean' }),
    row({ id: 'dup', duplicate: true }),
    row({ id: 'dup2', duplicate: true }),
    row({ id: 'bad', errors: ['unparseable date'] }),
  ]

  it('a row with any error is invalid', () => {
    expect(rowIsValid(row())).toBe(true)
    expect(rowIsValid(row({ errors: ['x'] }))).toBe(false)
  })

  it('counts duplicates excluding by default and including per override', () => {
    expect(countIncludedRows(rows, new Set())).toBe(1) // only 'clean'
    expect(countIncludedRows(rows, new Set(['dup']))).toBe(2)
    expect(countIncludedRows(rows, new Set(['dup', 'dup2']))).toBe(3)
  })

  it('never includes an invalid row even if overridden', () => {
    expect(countIncludedRows(rows, new Set(['bad']))).toBe(1)
  })

  it('counts valid duplicate rows', () => {
    expect(countDuplicateRows(rows)).toBe(2)
  })
})

describe('commitPayload', () => {
  const rows = [
    row({ id: 'clean' }),
    row({ id: 'dup', duplicate: true }),
    row({ id: 'bad-dup', duplicate: true, errors: ['bad'] }),
  ]

  it('carries only overridden ids that name a valid duplicate row', () => {
    expect(commitPayload(rows, new Set(['dup']), true)).toEqual({
      include_duplicates: ['dup'],
      auto_file: true,
    })
  })

  it('drops a stale id naming a non-duplicate or invalid row', () => {
    expect(
      commitPayload(rows, new Set(['clean', 'bad-dup', 'nonexistent']), false),
    ).toEqual({ include_duplicates: [], auto_file: false })
  })

  it('passes auto_file through unchanged', () => {
    expect(commitPayload([], new Set(), true).auto_file).toBe(true)
    expect(commitPayload([], new Set(), false).auto_file).toBe(false)
  })
})

describe('newlyUncategorized', () => {
  it('is the after-before delta', () => {
    expect(newlyUncategorized(2, 9)).toBe(7)
  })

  it('clamps at zero rather than going negative', () => {
    expect(newlyUncategorized(9, 2)).toBe(0)
  })
})

describe('completionMessage', () => {
  it('reports the auto-file split when some rows still need a category', () => {
    expect(completionMessage(202, 5)).toBe(
      '202 imported · 5 still need a category',
    )
  })

  it('uses singular "needs" for exactly one', () => {
    expect(completionMessage(10, 1)).toBe(
      '10 imported · 1 still needs a category',
    )
  })

  it('celebrates a fully categorized auto-file import', () => {
    expect(completionMessage(10, 0)).toBe('10 imported · fully categorized')
  })

  it('reports "sent to review" when auto-file was off', () => {
    expect(completionMessage(10, null)).toBe('10 imported — sent to review')
  })

  it('has a distinct message for an all-duplicate import', () => {
    expect(completionMessage(0, null)).toBe(
      'Nothing new — every row was a duplicate, skipped',
    )
    expect(completionMessage(0, 0)).toBe(
      'Nothing new — every row was a duplicate, skipped',
    )
  })
})
