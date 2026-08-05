import { describe, expect, it } from 'vitest'
import type { ConnectionOut } from '@/api/generated/types.gen'
import { findDuplicateConnection } from './connections'

function connection(overrides: Partial<ConnectionOut>): ConnectionOut {
  return {
    id: 'conn-1',
    provider: 'plaid',
    provider_institution_id: null,
    institution_name: null,
    status: 'active',
    last_synced_at: null,
    error_detail: null,
    investments_error_detail: null,
    investments_consent_required: false,
    accounts: [],
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('findDuplicateConnection', () => {
  it('matches same-provider connections on provider institution id', () => {
    const existing = connection({
      provider: 'plaid',
      provider_institution_id: 'ins_1',
      institution_name: 'Chase',
    })
    const match = findDuplicateConnection([existing], {
      provider: 'plaid',
      providerInstitutionId: 'ins_1',
      institutionName: 'Chase Bank',
    })
    expect(match).toEqual({ connection: existing, matchedBy: 'institution-id' })
  })

  it('never id-matches across providers — the id spaces are unrelated', () => {
    const existing = connection({
      provider: 'plaid',
      provider_institution_id: 'chase',
      institution_name: null,
    })
    expect(
      findDuplicateConnection([existing], {
        provider: 'mx',
        providerInstitutionId: 'chase',
        institutionName: null,
      }),
    ).toBeNull()
  })

  it('matches cross-provider on normalized institution name', () => {
    const existing = connection({
      provider: 'plaid',
      provider_institution_id: 'ins_1',
      institution_name: 'MX Bank',
    })
    const match = findDuplicateConnection([existing], {
      provider: 'mx',
      providerInstitutionId: 'mxbank',
      institutionName: '  mx  bank ',
    })
    expect(match).toEqual({ connection: existing, matchedBy: 'name' })
  })

  it('normalizes case, punctuation, and diacritics — not word content', () => {
    const existing = connection({
      provider: 'mx',
      institution_name: 'Crédit-Agricole, Inc.',
    })
    expect(
      findDuplicateConnection([existing], {
        provider: 'plaid',
        providerInstitutionId: null,
        institutionName: 'credit agricole inc',
      }),
    ).not.toBeNull()
    // The wireframe's honesty: "Chase" and "Chase Bank" read as different.
    expect(
      findDuplicateConnection([existing], {
        provider: 'plaid',
        providerInstitutionId: null,
        institutionName: 'Credit Agricole Bank Inc',
      }),
    ).toBeNull()
  })

  it('same-provider name overlap without id equality is not a duplicate', () => {
    const existing = connection({
      provider: 'plaid',
      provider_institution_id: 'ins_1',
      institution_name: 'Chase',
    })
    expect(
      findDuplicateConnection([existing], {
        provider: 'plaid',
        providerInstitutionId: 'ins_2',
        institutionName: 'Chase',
      }),
    ).toBeNull()
  })

  it('prefers the id match when both would hit', () => {
    const byName = connection({
      id: 'conn-name',
      provider: 'plaid',
      institution_name: 'Chase',
    })
    const byId = connection({
      id: 'conn-id',
      provider: 'mx',
      provider_institution_id: 'chase',
      institution_name: 'Something Else',
    })
    const match = findDuplicateConnection([byName, byId], {
      provider: 'mx',
      providerInstitutionId: 'chase',
      institutionName: 'Chase',
    })
    expect(match).toEqual({ connection: byId, matchedBy: 'institution-id' })
  })

  it('never matches on missing identity — null ids and empty names', () => {
    const existing = connection({
      provider: 'mx',
      provider_institution_id: null,
      institution_name: null,
    })
    expect(
      findDuplicateConnection([existing], {
        provider: 'mx',
        providerInstitutionId: null,
        institutionName: '  ',
      }),
    ).toBeNull()
  })

  it('excludes the just-created connection itself (the MX post-completion read)', () => {
    const created = connection({
      id: 'conn-new',
      provider: 'mx',
      provider_institution_id: 'mxbank',
      institution_name: 'MX Bank',
    })
    expect(
      findDuplicateConnection(
        [created],
        {
          provider: 'mx',
          providerInstitutionId: 'mxbank',
          institutionName: 'MX Bank',
        },
        { excludeId: 'conn-new' },
      ),
    ).toBeNull()
  })
})
