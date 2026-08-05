import type {
  ConnectionOut,
  ConnectionProvider,
} from '@/api/generated/types.gen'

// The duplicate guard's matcher (wireframe 7e, F8 CP2): institution
// identity is only knowable post-widget, so this runs against whatever
// the walk just learned — Plaid's Link metadata before the exchange, the
// completed connection after MX's completion (per-provider timing, the
// grilled decision on PRD #73).

/** What the just-finished widget walk knows about its institution. */
export type InstitutionCandidate = {
  provider: ConnectionProvider
  providerInstitutionId: string | null
  institutionName: string | null
}

export type DuplicateMatch = {
  connection: ConnectionOut
  /** How the match landed — 'institution-id' is the provider's own
   * identity (same-provider only; id spaces are unrelated across
   * providers), 'name' is the soft cross-provider heuristic the guard's
   * copy admits can miss. */
  matchedBy: 'institution-id' | 'name'
}

/** Lowercase, de-accent, and collapse punctuation/whitespace — exact
 * word content still has to agree ("Chase" ≠ "Chase Bank", the modal's
 * stated honesty). Empty after normalizing means no identity to match. */
function normalizeInstitutionName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Find the existing connection the candidate duplicates, or null.
 *
 * Same-provider: provider_institution_id equality — the provider's own
 * institution identity, checked first because it never false-positives.
 * Cross-provider: normalized institution-name equality — soft by design
 * (Plaid and MX ids don't line up; the name is all we share).
 * `excludeId` drops the just-created connection from the read (the MX
 * path completes before it can guard). */
export function findDuplicateConnection(
  existing: ConnectionOut[],
  candidate: InstitutionCandidate,
  options: { excludeId?: string } = {},
): DuplicateMatch | null {
  const others = existing.filter((c) => c.id !== options.excludeId)

  if (candidate.providerInstitutionId !== null) {
    const byId = others.find(
      (c) =>
        c.provider === candidate.provider &&
        c.provider_institution_id !== null &&
        c.provider_institution_id === candidate.providerInstitutionId,
    )
    if (byId) return { connection: byId, matchedBy: 'institution-id' }
  }

  const name =
    candidate.institutionName === null
      ? ''
      : normalizeInstitutionName(candidate.institutionName)
  if (name !== '') {
    const byName = others.find(
      (c) =>
        c.provider !== candidate.provider &&
        c.institution_name !== null &&
        normalizeInstitutionName(c.institution_name) === name,
    )
    if (byName) return { connection: byName, matchedBy: 'name' }
  }

  return null
}
