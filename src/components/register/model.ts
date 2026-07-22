// Relative imports on purpose: this module is on the vitest path, and the
// unit-test rig resolves no `@/` alias (the precedent is src/lib's tests).
import type {
  ListTransactionsData,
  TransactionOut,
} from '../../api/generated/types.gen'
import { formatMinorUnits } from '../../lib/money'

// Pure Register logic — everything the screen computes that isn't JSX:
// filter-state (de)serialization, the API query shape, date grouping, and
// the catpill's derived identity. Kept side-effect free so it unit-tests
// without mounting anything.

// --- filter state ---------------------------------------------------------
// The Register's find-grammar lives in the URL (shareable, back-button
// honest). `uncategorized` rides the category slot as a sentinel — one
// mental slot per chip, matching the listing API's category/uncategorized
// split.

export const UNCATEGORIZED = 'uncategorized'

export type RegisterSearch = {
  /** Text search — the backend `q` param (payee/description/name/notes). */
  q?: string
  /** Account id filter. */
  account?: string
  /** Category id filter, or the `uncategorized` sentinel. */
  category?: string
  /** Tag name filter (the API matches names case-insensitively). */
  tag?: string
  /** Inclusive date range, ISO `YYYY-MM-DD`. */
  from?: string
  to?: string
  /** The selected transaction (Inspector target). */
  txn?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function cleanDate(value: unknown): string | undefined {
  const str = cleanString(value)
  return str && ISO_DATE.test(str) ? str : undefined
}

/** validateSearch body: keep what parses, drop the rest silently — a
 * malformed hand-edited URL degrades to fewer filters, never an error. */
export function sanitizeRegisterSearch(
  raw: Record<string, unknown>,
): RegisterSearch {
  const search: RegisterSearch = {}
  const q = cleanString(raw.q)
  const account = cleanString(raw.account)
  const category = cleanString(raw.category)
  const tag = cleanString(raw.tag)
  const from = cleanDate(raw.from)
  const to = cleanDate(raw.to)
  const txn = cleanString(raw.txn)
  if (q !== undefined) search.q = q
  if (account !== undefined) search.account = account
  if (category !== undefined) search.category = category
  if (tag !== undefined) search.tag = tag
  if (from !== undefined) search.from = from
  if (to !== undefined) search.to = to
  if (txn !== undefined) search.txn = txn
  return search
}

export type ListQuery = NonNullable<ListTransactionsData['query']>

/** The URL filter state, translated to the listing API's parameters. */
export function toListQuery(search: RegisterSearch): ListQuery {
  const query: ListQuery = {}
  if (search.account) query.account_id = [search.account]
  if (search.category === UNCATEGORIZED) query.uncategorized = true
  else if (search.category) query.category_id = [search.category]
  if (search.tag) query.tag = [search.tag]
  if (search.from) query.date_from = search.from
  if (search.to) query.date_to = search.to
  if (search.q) query.q = search.q
  return query
}

/** True when any find-grammar is active (selection doesn't count) — the
 * boundary between "ledger is empty" and "nothing matches". */
export function hasActiveFilters(search: RegisterSearch): boolean {
  return Boolean(
    search.q ||
      search.account ||
      search.category ||
      search.tag ||
      search.from ||
      search.to,
  )
}

// --- date presets ---------------------------------------------------------

export type DatePreset = {
  id: string
  label: string
  from?: string
  to?: string
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The date chip's menu (wireframe voice: "This month ▾"). Rolling windows
 * computed against local-time `today`; "All dates" clears the range. */
export function datePresets(today = new Date()): DatePreset[] {
  const year = today.getFullYear()
  const month = today.getMonth()
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  return [
    { id: 'all', label: 'All dates' },
    {
      id: 'this-month',
      label: 'This month',
      from: isoDate(new Date(year, month, 1)),
      to: isoDate(today),
    },
    {
      id: 'last-month',
      label: 'Last month',
      from: isoDate(new Date(year, month - 1, 1)),
      to: isoDate(new Date(year, month, 0)),
    },
    {
      id: 'last-90',
      label: 'Last 90 days',
      from: isoDate(ninetyDaysAgo),
      to: isoDate(today),
    },
    {
      id: 'this-year',
      label: 'This year',
      from: `${year}-01-01`,
      to: isoDate(today),
    },
  ]
}

/** What the date chip reads: the matching preset's label, or the raw range
 * for a hand-crafted URL. */
export function dateChipLabel(search: RegisterSearch, today = new Date()) {
  if (!search.from && !search.to) return 'All dates'
  const preset = datePresets(today).find(
    (p) => p.from === search.from && p.to === search.to,
  )
  if (preset) return preset.label
  return `${search.from ?? '…'} – ${search.to ?? '…'}`
}

// --- date grouping --------------------------------------------------------

export type DayGroup = { date: string; items: TransactionOut[] }

/** Group a date-desc-ordered listing into day sections, preserving order.
 * Grouping is sequential — the API's keyset ordering keeps days contiguous,
 * including across page boundaries. */
export function groupByDay(items: TransactionOut[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}

/** "Jul 21" for the current year, "Jul 21, 2025" otherwise — the wireframe's
 * group-header voice. Parsed as local time (an ISO date given to `new Date`
 * alone would be read as UTC and drift a day in western zones). */
export function formatDayHeading(iso: string, today = new Date()): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(year !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

// --- amounts --------------------------------------------------------------

/** Wireframe #8's amount voice: an explicit sign on every figure — true
 * minus (U+2212, the mono's full-width minus) for money out, plus for
 * money in. Composes with the `amount` utility (The Tabular Rule). */
export function signedAmount(amountMinor: number, currency: string): string {
  const magnitude = formatMinorUnits(Math.abs(amountMinor), currency)
  return amountMinor < 0 ? `−${magnitude}` : `+${magnitude}`
}

/** Direction color — the only place the register spends semantic color. */
export function amountClass(amountMinor: number): string {
  return amountMinor < 0 ? 'text-destructive' : 'text-success'
}

// --- payee ----------------------------------------------------------------

/** What a row leads with: the display-name override when set, else the raw
 * description (display_name is an override, never a copy — backend law). */
export function payeeOf(txn: TransactionOut): string {
  return txn.display_name ?? txn.description_raw
}

// --- catpill identity -----------------------------------------------------
// F4 (taxonomy) gives categories user-chosen emoji + color. Until those
// fields exist on CategoryOut, the catpill derives both deterministically
// from the name: a stable hash into the muted --cat-1..10 band, and a
// keyword-matched emoji (fallback 🏷️). Same name, same pill, everywhere.

const CAT_COLOR_COUNT = 10

export function categoryColorVar(name: string): string {
  let hash = 0
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return `var(--cat-${(hash % CAT_COLOR_COUNT) + 1})`
}

const EMOJI_KEYWORDS: Array<[RegExp, string]> = [
  [/grocer|supermarket/, '🛒'],
  [/income|payroll|salary|wage/, '💰'],
  [/dining|restaurant|food|takeout|lunch|dinner/, '🍽️'],
  [/coffee|cafe/, '☕'],
  [/subs|subscription|streaming/, '📺'],
  [/transport|transit|gas|fuel|car|auto|parking/, '🚗'],
  [/travel|flight|hotel|vacation/, '✈️'],
  [/rent|mortgage|housing|home/, '🏠'],
  [/utilit|electric|water|internet|phone/, '💡'],
  [/shopping|clothes|clothing/, '🛍️'],
  [/health|medical|pharmacy|doctor|dental/, '🩺'],
  [/entertain|movies|games|music/, '🎬'],
  [/fee|bank|interest|finance/, '🏦'],
  [/insurance/, '🛡️'],
  [/education|tuition|books|school/, '🎓'],
  [/gift|donation|charity/, '🎁'],
  [/kid|child|baby/, '🧸'],
  [/pet/, '🐾'],
  [/tax/, '🧾'],
  [/saving|invest/, '📈'],
]

export function categoryEmoji(name: string): string {
  const needle = name.toLowerCase()
  for (const [pattern, emoji] of EMOJI_KEYWORDS) {
    if (pattern.test(needle)) return emoji
  }
  return '🏷️'
}

// --- provenance -----------------------------------------------------------

export type ProvenanceKind = 'rule' | 'history' | 'ai' | 'detection'

/** The provenance badge shown beside the applied category: only when the
 * pipeline's proposal is what's applied (same category) and it actually
 * decided something. A user-picked category has no lineage to badge. */
export function activeProvenance(txn: TransactionOut): ProvenanceKind | null {
  const proposal = txn.proposal
  if (!proposal || proposal.provenance === 'none') return null
  if (!txn.category || proposal.category?.id !== txn.category.id) return null
  return proposal.provenance
}

/** Badge text — the wireframe's mono-caps voice (RULE/HIST/AI/DET). */
export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  rule: 'rule',
  history: 'hist',
  ai: 'ai',
  detection: 'det',
}
