import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

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
