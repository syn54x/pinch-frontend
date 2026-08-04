import { describe, expect, it } from 'vitest'
import type { ProviderCatalogEntry } from '@/api/generated/types.gen'
import {
  capabilityChips,
  orderedCatalog,
  PROVIDER_COPY,
  promotedProvider,
} from './providers'

describe('capabilityChips', () => {
  it('collapses holdings + activity into one chip (wireframe 7a)', () => {
    expect(
      capabilityChips(['transactions', 'balances', 'holdings', 'activity']),
    ).toEqual([
      { label: 'transactions' },
      { label: 'balances' },
      { label: 'holdings & activity' },
    ])
  })

  it('states a missing holdings capability as a limit, muted', () => {
    expect(capabilityChips(['transactions', 'balances'])).toEqual([
      { label: 'transactions' },
      { label: 'balances' },
      { label: 'no holdings yet', muted: true },
    ])
  })

  it('keeps a lone holdings atom without inventing activity', () => {
    expect(capabilityChips(['balances', 'holdings'])).toEqual([
      { label: 'balances' },
      { label: 'holdings' },
    ])
  })
})

describe('orderedCatalog', () => {
  it('puts the recommended provider first regardless of server order', () => {
    const entries: ProviderCatalogEntry[] = [
      { provider: 'mx', configured: false, capabilities: [] },
      { provider: 'plaid', configured: true, capabilities: [] },
    ]
    expect(orderedCatalog(entries).map((entry) => entry.provider)).toEqual([
      'plaid',
      'mx',
    ])
  })
})

describe('PROVIDER_COPY', () => {
  it('covers every provider the contract knows', () => {
    expect(PROVIDER_COPY.plaid.label).toBe('Plaid')
    expect(PROVIDER_COPY.mx.label).toBe('MX')
  })
})

describe('promotedProvider', () => {
  const catalog: ProviderCatalogEntry[] = [
    { provider: 'plaid', configured: true, capabilities: [] },
    { provider: 'mx', configured: true, capabilities: [] },
  ]

  it('promotes the next configured method the user has not tried', () => {
    expect(promotedProvider(catalog, ['plaid'])).toBe('mx')
    expect(promotedProvider(catalog, ['mx'])).toBe('plaid')
  })

  it('promotes nothing when nothing was tried — cards stay neutral', () => {
    expect(promotedProvider(catalog, [])).toBeNull()
  })

  it('promotes nothing when every configured method was tried', () => {
    expect(promotedProvider(catalog, ['plaid', 'mx'])).toBeNull()
  })

  it('never promotes an unconfigured provider', () => {
    const oneConfigured: ProviderCatalogEntry[] = [
      { provider: 'plaid', configured: true, capabilities: [] },
      { provider: 'mx', configured: false, capabilities: [] },
    ]
    expect(promotedProvider(oneConfigured, ['plaid'])).toBeNull()
  })
})
