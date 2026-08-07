import { describe, expect, it } from 'vitest'
import { parseCsvRecords, sniffDelimiter, toCsv } from './csv'

describe('toCsv', () => {
  it('joins plain fields with commas and CRLF rows', () => {
    expect(
      toCsv(
        ['date', 'amount'],
        [
          ['2026-07-01', '-4.50'],
          ['2026-07-02', '12.00'],
        ],
      ),
    ).toBe('date,amount\r\n2026-07-01,-4.50\r\n2026-07-02,12.00')
  })

  it('quotes fields with commas, quotes, and newlines — doubling quotes', () => {
    expect(toCsv(['name'], [['Uber — client, visit']])).toBe(
      'name\r\n"Uber — client, visit"',
    )
    expect(toCsv(['note'], [['she said "hi"']])).toBe(
      'note\r\n"she said ""hi"""',
    )
    expect(toCsv(['memo'], [['line one\nline two']])).toBe(
      'memo\r\n"line one\nline two"',
    )
  })
})

describe('sniffDelimiter', () => {
  it('picks the delimiter that splits the header row the most', () => {
    expect(
      sniffDelimiter('Date,Description,Amount\n2026-01-05,COFFEE,-4.50'),
    ).toBe(',')
    expect(
      sniffDelimiter('Date;Description;Amount\n2026-01-05;COFFEE;-4.50'),
    ).toBe(';')
    expect(sniffDelimiter('Date\tDescription\tAmount')).toBe('\t')
    expect(sniffDelimiter('Date|Description|Amount')).toBe('|')
  })

  it('defaults to comma when nothing signals another delimiter', () => {
    expect(sniffDelimiter('just one field')).toBe(',')
    expect(sniffDelimiter('')).toBe(',')
  })
})

describe('parseCsvRecords', () => {
  it('splits plain rows on the delimiter', () => {
    expect(
      parseCsvRecords('Date,Description,Amount\n2026-01-05,COFFEE,-4.50'),
    ).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-01-05', 'COFFEE', '-4.50'],
    ])
  })

  it('honors a non-comma delimiter', () => {
    expect(parseCsvRecords('a;b;c\n1;2;3', ';')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with embedded delimiters, quotes, and newlines', () => {
    expect(
      parseCsvRecords('name,note\n"Uber — client, visit","she said ""hi"""'),
    ).toEqual([
      ['name', 'note'],
      ['Uber — client, visit', 'she said "hi"'],
    ])
    expect(parseCsvRecords('memo\n"line one\nline two"')).toEqual([
      ['memo'],
      ['line one\nline two'],
    ])
  })

  it('accepts CRLF and bare LF endings, and drops no trailing blank line', () => {
    expect(parseCsvRecords('a,b\r\n1,2\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
    expect(parseCsvRecords('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('is the inverse of toCsv for plain and quoted fields', () => {
    const rows = [
      ['2026-01-05', 'COFFEE SHOP', '-4.50'],
      ['2026-01-06', 'Uber — client, visit', '-9.99'],
    ]
    const csv = toCsv(['date', 'description', 'amount'], rows)
    expect(parseCsvRecords(csv)).toEqual([
      ['date', 'description', 'amount'],
      ...rows,
    ])
  })
})
