// Relative imports on purpose: this module is on the vitest path, and the
// unit-test rig resolves no `@/` alias (the model.ts precedent).
import type {
  CommitIn,
  ImportRowOut,
  MappingSpec,
} from '../../api/generated/types.gen'
import { parseCsvRecords } from '../../lib/csv'

// Pure CSV-import-wizard logic (F10 CP6, #92): turning the mapping form's
// per-column choices into the backend's MappingSpec, deriving the initial
// form state from a suggested or confirmed spec, shaping the commit
// request, and the completion state's counts and copy. Kept side-effect
// free so it unit-tests without mounting anything or touching the network.

// --- column roles -----------------------------------------------------

export type ColumnRole =
  | 'skip'
  | 'date'
  | 'payee'
  | 'amount'
  | 'debit'
  | 'credit'

export const COLUMN_ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> =
  [
    { value: 'skip', label: "Don't import" },
    { value: 'date', label: 'Date' },
    { value: 'payee', label: 'Payee / description' },
    { value: 'amount', label: 'Amount' },
    { value: 'debit', label: 'Debit (money out)' },
    { value: 'credit', label: 'Credit (money in)' },
  ]

/** One role per column, seeded from a MappingSpec (the backend's suggestion
 * or a previously confirmed mapping) — columns the spec doesn't name start
 * 'skip'. Multiple columns may hold 'payee' (joined); every other role is
 * exclusive, enforced by `buildMappingSpec`, not here. */
export function rolesFromMapping(
  spec: MappingSpec,
  columnCount: number,
): ColumnRole[] {
  const roles: ColumnRole[] = Array.from({ length: columnCount }, () => 'skip')
  const set = (index: number | null | undefined, role: ColumnRole) => {
    if (
      index !== null &&
      index !== undefined &&
      index >= 0 &&
      index < columnCount
    ) {
      roles[index] = role
    }
  }
  set(spec.date_column, 'date')
  for (const column of spec.description_columns ?? []) set(column, 'payee')
  set(spec.amount_column, 'amount')
  set(spec.debit_column, 'debit')
  set(spec.credit_column, 'credit')
  return roles
}

export type ColumnPreview = {
  headerRow: string[] | null
  sampleRow: string[] | null
  columnCount: number
}

/** The mapping table's column shape, derived from the raw file text and
 * the delimiter/header-row controls — NOT frozen at upload time. The
 * delimiter select and header-row checkbox exist precisely to correct a
 * bad sniff; if changing them didn't reshape the table, a mis-sniffed file
 * (e.g. one column instead of three) would be an unrecoverable dead end,
 * since a Date/Amount mapping needs columns that were never parsed out. */
export function deriveColumnPreview(
  text: string,
  delimiter: string,
  hasHeader: boolean,
): ColumnPreview {
  const records = parseCsvRecords(text, delimiter)
  const headerRow = hasHeader ? (records[0] ?? null) : null
  const sampleRow = (hasHeader ? records[1] : records[0]) ?? null
  const columnCount = Math.max(
    headerRow?.length ?? 0,
    sampleRow?.length ?? 0,
    1,
  )
  return { headerRow, sampleRow, columnCount }
}

/** MappingSpec's amount-sign convention, named once — spelled out as a
 * union in three places otherwise (the draft, the mapping step's state,
 * and its `<select>` handler). */
export type Sign = 'negative_out' | 'positive_out'

export type MappingDraft = {
  delimiter: string
  hasHeader: boolean
  dateFormat: string
  sign: Sign
  roles: ColumnRole[]
}

export type MappingResult =
  | { ok: true; spec: MappingSpec }
  | { ok: false; error: string }

function indicesOf(roles: ColumnRole[], role: ColumnRole): number[] {
  return roles.flatMap((candidate, index) =>
    candidate === role ? [index] : [],
  )
}

/** The mapping form's validation, mirroring the backend's own
 * `_exactly_one_amount_shape` rule (imports/spec.py) so a shape the form
 * itself rejects never round-trips to a 400: exactly one Date column, and
 * exactly one Amount column XOR a Debit+Credit pair — never neither, never
 * both. Payee may be zero or many columns (joined with spaces). */
export function buildMappingSpec(draft: MappingDraft): MappingResult {
  const dateColumns = indicesOf(draft.roles, 'date')
  const amountColumns = indicesOf(draft.roles, 'amount')
  const debitColumns = indicesOf(draft.roles, 'debit')
  const creditColumns = indicesOf(draft.roles, 'credit')
  const payeeColumns = indicesOf(draft.roles, 'payee')

  if (dateColumns.length !== 1) {
    return { ok: false, error: 'Pick exactly one column as Date.' }
  }
  if (amountColumns.length > 1) {
    return { ok: false, error: 'Only one column can be Amount.' }
  }
  if (debitColumns.length > 1 || creditColumns.length > 1) {
    return { ok: false, error: 'Only one column each for Debit and Credit.' }
  }
  if (debitColumns.length !== creditColumns.length) {
    return { ok: false, error: 'Debit and Credit must be picked together.' }
  }
  const single = amountColumns.length === 1
  const pair = debitColumns.length === 1 && creditColumns.length === 1
  if (single === pair) {
    return {
      ok: false,
      error: 'Pick one Amount column, or a Debit and Credit column pair.',
    }
  }
  if (draft.dateFormat.trim() === '') {
    return { ok: false, error: 'A date format is required.' }
  }

  return {
    ok: true,
    spec: {
      delimiter: draft.delimiter,
      has_header: draft.hasHeader,
      date_column: dateColumns[0],
      date_format: draft.dateFormat.trim(),
      amount_column: single ? amountColumns[0] : null,
      debit_column: pair ? debitColumns[0] : null,
      credit_column: pair ? creditColumns[0] : null,
      sign: draft.sign,
      description_columns: payeeColumns,
    },
  }
}

function columnLabel(index: number, headerRow: string[] | null): string {
  const named = headerRow?.[index]
  return named && named.trim() !== '' ? named : `Column ${index + 1}`
}

/** What a mapping says, in the header's own words when a header row is
 * available — the "applied profile is visible to the user" acceptance
 * criterion (#92). Rendered only for a profile-matched import (the preview
 * step's banner); a mapping the user just confirmed by hand doesn't repeat
 * it back through this — the form they filled in already says it. */
export function mappingSummaryLines(
  spec: MappingSpec,
  headerRow: string[] | null,
): string[] {
  const lines = [`Date → ${columnLabel(spec.date_column, headerRow)}`]
  const descriptionColumns = spec.description_columns ?? []
  if (descriptionColumns.length > 0) {
    lines.push(
      `Payee → ${descriptionColumns.map((column) => columnLabel(column, headerRow)).join(' + ')}`,
    )
  }
  if (spec.amount_column !== null && spec.amount_column !== undefined) {
    const signNote =
      spec.sign === 'positive_out'
        ? 'positive = money out'
        : 'negative = money out'
    lines.push(
      `Amount → ${columnLabel(spec.amount_column, headerRow)} (${signNote})`,
    )
  } else if (
    spec.debit_column !== null &&
    spec.debit_column !== undefined &&
    spec.credit_column !== null &&
    spec.credit_column !== undefined
  ) {
    lines.push(
      `Debit → ${columnLabel(spec.debit_column, headerRow)}, Credit → ${columnLabel(spec.credit_column, headerRow)}`,
    )
  }
  return lines
}

// --- row preview & commit -----------------------------------------------

/** A row the commit endpoint will refuse to include regardless of override
 * (a parse error voids the row) — the client-side mirror of the backend's
 * `valid` flag, which ImportRowOut doesn't expose directly but `errors`
 * implies: a row parses clean iff it recorded no errors. */
export function rowIsValid(row: ImportRowOut): boolean {
  return row.errors.length === 0
}

/** A duplicate-flagged row the per-row override actually applies to — the
 * backend's own `include_duplicates` precondition (valid AND duplicate),
 * named once instead of re-spelled at every call site. */
export function isOverridableDuplicate(row: ImportRowOut): boolean {
  return row.duplicate && rowIsValid(row)
}

/** How many of the previewed rows will actually commit: valid rows, minus
 * duplicates the user hasn't overridden. What the Import button counts. */
export function countIncludedRows(
  rows: ImportRowOut[],
  includedDuplicateIds: ReadonlySet<string>,
): number {
  return rows.filter(
    (row) =>
      rowIsValid(row) && (!row.duplicate || includedDuplicateIds.has(row.id)),
  ).length
}

export function countDuplicateRows(rows: ImportRowOut[]): number {
  return rows.filter(isOverridableDuplicate).length
}

/** The commit request body — filters `includedDuplicateIds` down to ids
 * that are still valid, duplicate-flagged rows of the CURRENT preview,
 * defensively: a stale id (e.g. surviving a mapping re-confirm that
 * replaced the rows) is silently dropped rather than sent to a 400. */
export function commitPayload(
  rows: ImportRowOut[],
  includedDuplicateIds: ReadonlySet<string>,
  autoFile: boolean,
): CommitIn {
  const overridable = new Set(
    rows.filter(isOverridableDuplicate).map((row) => row.id),
  )
  return {
    include_duplicates: [...includedDuplicateIds].filter((id) =>
      overridable.has(id),
    ),
    auto_file: autoFile,
  }
}

/** The preview's duplicate-status line — reflects the per-row override
 * state instead of a static "skipped" that would contradict the Import
 * button the moment a row is overridden: "2 duplicates flagged" until an
 * override lands, then "2 duplicates flagged · 1 included". Empty when
 * there's nothing to report — the caller renders nothing for that case. */
export function duplicateSummaryLine(
  duplicateCount: number,
  includedCount: number,
): string {
  if (duplicateCount === 0) return ''
  const noun = duplicateCount === 1 ? 'duplicate' : 'duplicates'
  const base = `${duplicateCount} ${noun} flagged`
  return includedCount > 0 ? `${base} · ${includedCount} included` : base
}

// --- completion -----------------------------------------------------------

/** The delta attributable to this import: how many of the account's
 * reviewed-but-uncategorized rows are new since the pre-commit snapshot.
 * Clamped at zero — a concurrent human review shrinking the count during
 * the poll window must never read as a negative "still need a category". */
export function newlyUncategorized(before: number, after: number): number {
  return Math.max(0, after - before)
}

/** The wizard's completion line (story 35): "N imported · M still need a
 * category" under auto-file, "N imported — sent to review" without it (
 * `stillUncategorized` is null exactly when auto-file was off — nothing was
 * auto-filed, so the still-uncategorized question doesn't apply yet). */
export function completionMessage(
  imported: number,
  stillUncategorized: number | null,
): string {
  const importedLabel = `${imported} imported`
  if (imported === 0) return 'Nothing new — every row was a duplicate, skipped'
  if (stillUncategorized === null) return `${importedLabel} — sent to review`
  if (stillUncategorized === 0) return `${importedLabel} · fully categorized`
  const verb = stillUncategorized === 1 ? 'needs' : 'need'
  return `${importedLabel} · ${stillUncategorized} still ${verb} a category`
}
