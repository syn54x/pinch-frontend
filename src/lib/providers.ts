import type {
  ConnectionProvider,
  ProviderCatalogEntry,
} from '@/api/generated/types.gen'

/** One kind of data a provider delivers, as the catalog spells it. */
export type ProviderCapability = ProviderCatalogEntry['capabilities'][number]

// The picker's display copy (wireframe 7a). Static v1 by decision (PRD
// #73): labels, blurbs, and the "recommended" ordering are frontend copy —
// which providers exist, whether this instance configured them, and what
// each delivers all come from the catalog endpoint, never from here.

export const PROVIDER_COPY: Record<
  ConnectionProvider,
  { label: string; blurb: string; recommended?: boolean }
> = {
  plaid: {
    label: 'Plaid',
    blurb: 'Most US banks, credit unions, and brokerages.',
    recommended: true,
  },
  mx: {
    label: 'MX',
    blurb: 'Broad US coverage, strong with credit unions.',
  },
}

const PROVIDER_ORDER: readonly ConnectionProvider[] = ['plaid', 'mx']

/** The catalog in picker order: recommended (Plaid) first — static v1
 * ordering until real coverage data exists (PRD #73, further notes). */
export function orderedCatalog<T extends { provider: ConnectionProvider }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider),
  )
}

/** Returned-empty promotion (wireframe 7d): after a widget came back
 * without connecting, the next configured method the user has NOT tried
 * is promoted ("Try MX"). Null when nothing was tried yet — cards stay
 * neutral — or when every way in was already walked. */
export function promotedProvider(
  entries: ProviderCatalogEntry[],
  tried: ConnectionProvider[],
): ConnectionProvider | null {
  if (tried.length === 0) return null
  const next = orderedCatalog(entries).find(
    (entry) => entry.configured && !tried.includes(entry.provider),
  )
  return next?.provider ?? null
}

export type CapabilityChip = {
  label: string
  /** A stated provider limit ("no holdings yet") — rendered quiet, never
   * as an error (PRD #86 story 12). */
  muted?: boolean
}

/** Catalog capability atoms → the chips of wireframe 7a: holdings and
 * activity read as one thing to users ("holdings & activity"), and a
 * missing holdings atom is said out loud as a limit. */
export function capabilityChips(
  capabilities: ProviderCapability[],
): CapabilityChip[] {
  const has = (atom: ProviderCapability) => capabilities.includes(atom)
  const chips: CapabilityChip[] = []
  if (has('transactions')) chips.push({ label: 'transactions' })
  if (has('balances')) chips.push({ label: 'balances' })
  if (has('holdings') && has('activity')) {
    chips.push({ label: 'holdings & activity' })
  } else if (has('holdings')) {
    chips.push({ label: 'holdings' })
  } else if (has('activity')) {
    chips.push({ label: 'activity' })
  } else {
    chips.push({ label: 'no holdings yet', muted: true })
  }
  return chips
}
