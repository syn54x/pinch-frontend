import { describe, expect, it } from 'vitest'
import { MAX_ACCOUNT_RESULTS, matchAccounts } from './global-search'

function account(label: string, archived = false) {
  return { label, archived }
}

describe('matchAccounts', () => {
  it('matches case-insensitively on any substring of the label', () => {
    const accounts = [
      account('Chase Checking'),
      account('Ally Savings'),
      account('Chase Sapphire'),
    ]
    expect(matchAccounts(accounts, 'chase').map((a) => a.label)).toEqual([
      'Chase Checking',
      'Chase Sapphire',
    ])
    expect(matchAccounts(accounts, 'SAV').map((a) => a.label)).toEqual([
      'Ally Savings',
    ])
    expect(matchAccounts(accounts, 'checking')).toHaveLength(1)
  })

  it('trims the query and treats blank as match-all (the jump list)', () => {
    const accounts = [account('Chase Checking'), account('Ally Savings')]
    expect(matchAccounts(accounts, '  chase ')).toHaveLength(1)
    expect(matchAccounts(accounts, '')).toHaveLength(2)
    expect(matchAccounts(accounts, '   ')).toHaveLength(2)
  })

  it('never surfaces archived accounts, even on an exact match', () => {
    const accounts = [account('Old Checking', true), account('New Checking')]
    expect(matchAccounts(accounts, 'old')).toEqual([])
    expect(matchAccounts(accounts, 'checking').map((a) => a.label)).toEqual([
      'New Checking',
    ])
  })

  it('returns nothing when nothing matches', () => {
    expect(matchAccounts([account('Chase Checking')], 'venmo')).toEqual([])
  })

  it('caps results at MAX_ACCOUNT_RESULTS', () => {
    const many = Array.from({ length: MAX_ACCOUNT_RESULTS + 3 }, (_, i) =>
      account(`Account ${i}`),
    )
    expect(matchAccounts(many, '')).toHaveLength(MAX_ACCOUNT_RESULTS)
    expect(matchAccounts(many, 'account')).toHaveLength(MAX_ACCOUNT_RESULTS)
  })
})
