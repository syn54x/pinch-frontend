// The split editor's draft as pure data (F3 CP3, wireframe #7): lines the
// user is typing, parsed and guarded without a browser. Amounts are typed
// as unsigned magnitudes ("164.90") and parsed against the currency's
// minor-unit exponent by string slicing — the same float-free discipline
// as lib/money.ts — and the parent's sign is applied on the way out (the
// backend's rule: split lines carry the parent transaction's sign).
//
// The lines-vs-total guard lives here: `splitStatus` is the single truth
// the editor's cue, the Accept button, and the keyboard verb all read —
// a mismatched document never reaches the review call.

import type {
  CategoryRef,
  ProposalProvenance,
  SplitLineIn,
  TransactionOut,
} from '@/api/generated/types.gen'

export interface SplitDraftLine {
  /** The magnitude exactly as typed — parsed on demand, never floated. */
  amountInput: string
  category: CategoryRef | null
  /** Who decided this line's category: the proposal's provenance on the
   * inherited first line, `none` on user-added or user-repicked lines. */
  provenance: ProposalProvenance
}

/** Minor-unit exponent from Intl's own CLDR data (money.ts's approach) —
 * 2 for USD, 0 for JPY — so no currency table lives here. */
function fractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  )
}

/** Parse a typed magnitude into positive minor units. `null` means "not a
 * usable line amount": empty, malformed, zero (the backend rejects zero
 * lines), or more fraction digits than the currency carries. Float-free:
 * digits are assembled by string, never divided. */
export function parseAmountInput(
  input: string,
  currency: string,
): number | null {
  const digits = fractionDigits(currency)
  const cleaned = input.replace(/[$,\s]/g, '')
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned)
  if (match === null) return null
  const whole = match[1]
  const frac = match[2] ?? ''
  if (frac.length > digits) return null
  const minor = Number(`${whole}${frac.padEnd(digits, '0')}`)
  if (!Number.isSafeInteger(minor) || minor === 0) return null
  return minor
}

/** A magnitude in minor units as editable text ("164.90") — the inverse of
 * `parseAmountInput`, same string slicing as money.ts. */
export function formatAmountInput(
  magnitudeMinor: number,
  currency: string,
): string {
  const digits = fractionDigits(currency)
  const raw = String(Math.abs(magnitudeMinor)).padStart(digits + 1, '0')
  return digits === 0 ? raw : `${raw.slice(0, -digits)}.${raw.slice(-digits)}`
}

/** Opening the editor: the whole amount on an inherited first line (it
 * keeps the proposal's category and provenance — the wireframe's Costco
 * card), plus one empty line to fill. The anchor transaction itself is
 * never copied — categories move to the lines, the raw data stays put. */
export function initialSplitDraft(txn: TransactionOut): SplitDraftLine[] {
  const proposal = txn.proposal
  const category = proposal?.category ?? null
  return [
    {
      amountInput: formatAmountInput(txn.amount_minor, txn.currency),
      category,
      provenance: category !== null ? (proposal?.provenance ?? 'none') : 'none',
    },
    { amountInput: '', category: null, provenance: 'none' },
  ]
}

export function emptySplitLine(): SplitDraftLine {
  return { amountInput: '', category: null, provenance: 'none' }
}

export interface SplitStatus {
  /** Signed sum of the parseable lines, minor units. */
  linesTotalMinor: number
  /** Every line parses to a nonzero amount. */
  complete: boolean
  /** ≥2 complete lines summing exactly to the parent — the review gate. */
  valid: boolean
}

export function splitStatus(
  lines: SplitDraftLine[],
  txn: TransactionOut,
): SplitStatus {
  const sign = txn.amount_minor < 0 ? -1 : 1
  let total = 0
  let complete = true
  for (const line of lines) {
    const minor = parseAmountInput(line.amountInput, txn.currency)
    if (minor === null) complete = false
    else total += sign * minor
  }
  return {
    linesTotalMinor: total,
    complete,
    valid: complete && lines.length >= 2 && total === txn.amount_minor,
  }
}

/** The review call's split document. Only meaningful on a valid draft —
 * callers gate on `splitStatus(...).valid` first. */
export function splitsForReview(
  lines: SplitDraftLine[],
  txn: TransactionOut,
): SplitLineIn[] {
  const sign = txn.amount_minor < 0 ? -1 : 1
  return lines.map((line) => ({
    amount_minor:
      sign * (parseAmountInput(line.amountInput, txn.currency) ?? 0),
    category_id: line.category?.id ?? null,
  }))
}
