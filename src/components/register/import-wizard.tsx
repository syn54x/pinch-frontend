import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  commitImportMutation,
  confirmMappingMutation,
  createImportMutation,
  ledgerStatsOptions,
  ledgerStatsQueryKey,
  listAccountsQueryKey,
  listTransactionsQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  ledgerStats,
  listAccounts,
  listImportRows,
  listTransactions,
} from '@/api/generated/sdk.gen'
import type {
  AccountOut,
  ImportOut,
  ImportRowOut,
  MappingSpec,
} from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sniffDelimiter } from '@/lib/csv'
import { formatMinorUnits } from '@/lib/money'
import { walkPages } from '@/lib/paginate'
import {
  buildMappingSpec,
  COLUMN_ROLE_OPTIONS,
  type ColumnRole,
  commitPayload,
  completionMessage,
  countDuplicateRows,
  countIncludedRows,
  deriveColumnPreview,
  duplicateSummaryLine,
  isOverridableDuplicate,
  type MappingDraft,
  mappingSummaryLines,
  newlyUncategorized,
  rolesFromMapping,
  rowIsValid,
  type Sign,
} from './import-model'

// F10 CP6 (#92, wireframe s9/2a): the CSV import wizard, driving the
// existing server-side pipeline end-to-end — create import → confirm
// mapping → row preview with duplicate flags → commit. Manual accounts
// only (the endpoint 409s on connected ones). Four screens: upload,
// mapping (skipped when a saved per-source profile already matched at
// upload — the wireframe's "profile: X · applied" chip), preview (row
// list with per-row duplicate overrides, the auto-file toggle, and the
// commit button — combined on one screen per the wireframe), and
// completion. No backend changes: everything here is the pipeline the
// server already ships.

// The API's own page cap — every cursor walk in this file (accounts,
// import rows, the uncategorized-transactions snapshot) pages at it.
const WALK_PAGE_SIZE = 100
const SETTLE_POLL_MS = 1_500
const SETTLE_MAX_ATTEMPTS = 40 // ~60s bounded poll, the onboarding precedent

type WizardStep =
  | { kind: 'upload' }
  | {
      kind: 'mapping'
      batch: ImportOut
      /** The raw file text — the mapping step derives its column table from
       * this on every delimiter/header-row change, not a shape frozen at
       * upload time (see `deriveColumnPreview`). */
      text: string
    }
  | {
      kind: 'preview'
      batch: ImportOut
      headerRow: string[] | null
      matchedProfile: boolean
    }
  | {
      kind: 'settling'
      imported: number
      accountId: string
      uncategorizedBefore: number
      unreviewedBefore: number
    }
  | { kind: 'done'; imported: number; stillUncategorized: number | null }

export function ImportCsv() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 rounded-full text-[11.5px]"
        data-testid="import-trigger"
        onClick={() => setOpen(true)}
      >
        Import CSV
      </Button>
      {/* Mount-per-open so every import starts from a fresh wizard. */}
      {open && <ImportWizardDialog onOpenChange={setOpen} />}
    </>
  )
}

function ImportWizardDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<WizardStep>({ kind: 'upload' })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Import CSV</DialogTitle>
        <DialogDescription>
          {step.kind === 'upload' &&
            'Bring in history for an account without a bank connection.'}
          {step.kind === 'mapping' &&
            `Confirm how ${step.batch.filename} maps onto a transaction.`}
          {step.kind === 'preview' &&
            `${step.batch.filename} — review duplicates and file the import.`}
          {step.kind === 'settling' &&
            'Filing the import — this only takes a moment.'}
          {step.kind === 'done' && 'The import is on the ledger.'}
        </DialogDescription>
        {step.kind === 'upload' && <UploadStep onUploaded={setStep} />}
        {step.kind === 'mapping' && (
          <MappingStep
            batch={step.batch}
            text={step.text}
            onConfirmed={(batch, headerRow) =>
              setStep({
                kind: 'preview',
                batch,
                headerRow,
                matchedProfile: false,
              })
            }
          />
        )}
        {step.kind === 'preview' && (
          <PreviewStep
            batch={step.batch}
            headerRow={step.headerRow}
            matchedProfile={step.matchedProfile}
            onCommitted={(result) =>
              setStep(
                result.autoFile
                  ? {
                      kind: 'settling',
                      imported: result.imported,
                      accountId: step.batch.account_id,
                      uncategorizedBefore: result.uncategorizedBefore,
                      unreviewedBefore: result.unreviewedBefore,
                    }
                  : {
                      kind: 'done',
                      imported: result.imported,
                      stillUncategorized: null,
                    },
              )
            }
          />
        )}
        {step.kind === 'settling' && (
          <SettlingStep
            {...step}
            onSettled={(stillUncategorized) =>
              setStep({
                kind: 'done',
                imported: step.imported,
                stillUncategorized,
              })
            }
          />
        )}
        {step.kind === 'done' && (
          <DoneStep
            imported={step.imported}
            stillUncategorized={step.stillUncategorized}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- step 1: upload ---------------------------------------------------

/** Every account, cursor-walked to exhaustion — a single page would make a
 * manual account beyond the API's page cap unreachable as an import
 * target. The account picker is a complete list or it's broken, not a
 * "first 100" approximation. */
async function walkAllAccounts(): Promise<AccountOut[]> {
  return walkPages<AccountOut>(async (cursor) => {
    const { data } = await listAccounts({
      query: { cursor, limit: WALK_PAGE_SIZE },
      throwOnError: true,
    })
    return data
  })
}

function UploadStep({
  onUploaded,
}: {
  onUploaded: (
    step: Extract<WizardStep, { kind: 'mapping' | 'preview' }>,
  ) => void
}) {
  const accounts = useQuery({
    queryKey: ['import-accounts'],
    queryFn: walkAllAccounts,
  })
  const manualAccounts = (accounts.data ?? []).filter(
    (account) => account.manual && !account.archived,
  )
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accountFieldId = useId()
  const fileFieldId = useId()

  const selectedAccountId = manualAccounts.some((a) => a.id === accountId)
    ? accountId
    : (manualAccounts[0]?.id ?? '')

  const upload = useMutation({
    ...createImportMutation(),
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  async function submit() {
    if (!file || !selectedAccountId) return
    setError(null)
    const text = await file.text()
    upload.mutate(
      { body: { account_id: selectedAccountId, file } },
      {
        onSuccess: (batch) => {
          if (batch.status === 'uploaded') {
            // The mapping step derives its own column table from `text` —
            // reactively, on every delimiter/header correction — so nothing
            // needs precomputing here (see `deriveColumnPreview`).
            onUploaded({ kind: 'mapping', batch, text })
          } else {
            // A matching saved profile skips mapping confirmation (story 32):
            // the batch already landed at `previewed`. Nothing here corrects
            // the mapping, so a one-time derive is fine.
            const { headerRow } = deriveColumnPreview(
              text,
              batch.confirmed_mapping?.delimiter ?? ',',
              batch.confirmed_mapping?.has_header ?? true,
            )
            onUploaded({
              kind: 'preview',
              batch,
              headerRow,
              matchedProfile: true,
            })
          }
        },
      },
    )
  }

  if (accounts.isPending) return null

  if (manualAccounts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        CSV import is for manual accounts — the ones you keep yourself, no bank
        attached. Create one from + Add, then come back to import its history.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={accountFieldId}>Account</Label>
        <select
          id={accountFieldId}
          value={selectedAccountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {manualAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={fileFieldId}>File</Label>
        <input
          id={fileFieldId}
          type="file"
          accept=".csv,text/csv"
          data-testid="import-file-input"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:h-8 file:rounded-md file:border file:bg-background file:px-2.5 file:text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          data-testid="import-upload-submit"
          disabled={!file || !selectedAccountId || upload.isPending}
          onClick={submit}
        >
          {upload.isPending ? 'Uploading…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

// --- step 2: mapping (only when nothing matched a saved profile) --------

function MappingStep({
  batch,
  text,
  onConfirmed,
}: {
  batch: ImportOut
  text: string
  onConfirmed: (batch: ImportOut, headerRow: string[] | null) => void
}) {
  const suggested = batch.suggested_mapping
  const [delimiter, setDelimiter] = useState(
    suggested?.delimiter ?? sniffDelimiter(text),
  )
  const [hasHeader, setHasHeader] = useState(suggested?.has_header ?? true)
  const [dateFormat, setDateFormat] = useState(
    suggested?.date_format ?? '%Y-%m-%d',
  )
  const [sign, setSign] = useState<Sign>(suggested?.sign ?? 'negative_out')
  const [error, setError] = useState<string | null>(null)

  // The column table is derived from the raw file text on every
  // delimiter/header-row change — NOT frozen at upload time. Those two
  // controls exist to correct a bad sniff; if correcting them didn't
  // reshape the table, a mis-sniffed file (e.g. one column instead of
  // three) would be an unrecoverable dead end.
  const { headerRow, sampleRow, columnCount } = useMemo(
    () => deriveColumnPreview(text, delimiter, hasHeader),
    [text, delimiter, hasHeader],
  )

  const [roles, setRoles] = useState<ColumnRole[]>(() =>
    suggested
      ? rolesFromMapping(suggested, columnCount)
      : Array.from({ length: columnCount }, () => 'skip'),
  )
  // Re-seed roles whenever a delimiter/header correction reshapes the
  // table — stale role indices from the old shape would otherwise point at
  // the wrong (or nonexistent) columns. The suggested mapping only seeds
  // the INITIAL shape (the lazy useState above); any subsequent reshape is
  // the user correcting a bad sniff, so it starts clean. The ref is
  // primed with the first render's own columnCount, so this never fires
  // on mount — only on a genuine post-mount change.
  const previousColumnCount = useRef(columnCount)
  useEffect(() => {
    if (previousColumnCount.current === columnCount) return
    previousColumnCount.current = columnCount
    setRoles(Array.from({ length: columnCount }, () => 'skip'))
  }, [columnCount])

  const confirm = useMutation({
    ...confirmMappingMutation(),
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  const draft: MappingDraft = { delimiter, hasHeader, dateFormat, sign, roles }
  const result = buildMappingSpec(draft)

  function setRole(index: number, role: ColumnRole) {
    setRoles((prev) => prev.map((current, i) => (i === index ? role : current)))
  }

  function submit() {
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    confirm.mutate(
      { path: { import_id: batch.id }, body: result.spec },
      { onSuccess: (confirmed) => onConfirmed(confirmed, headerRow) },
    )
  }

  const showSign = result.ok && result.spec.amount_column !== null

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-primary"
            checked={hasHeader}
            onChange={(event) => setHasHeader(event.target.checked)}
          />
          First row is a header
        </label>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="import-delimiter">Delimiter</Label>
          <select
            id="import-delimiter"
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            {/* A JSX string attribute never processes "\t" — that's the two
                literal characters backslash+t, not a tab. An expression
                container is required for a real tab character, both here
                and to match a sniffed/suggested delimiter that is one. */}
            <option value={'\t'}>Tab</option>
            <option value="|">Pipe</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="import-date-format">Date format</Label>
          <Input
            id="import-date-format"
            value={dateFormat}
            onChange={(event) => setDateFormat(event.target.value)}
            className="h-8 w-32 text-sm"
            placeholder="%Y-%m-%d"
          />
        </div>
        {showSign && (
          <div className="flex items-center gap-1.5">
            <Label htmlFor="import-sign">Amount sign</Label>
            <select
              id="import-sign"
              value={sign}
              onChange={(event) => setSign(event.target.value as Sign)}
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="negative_out">Negative = money out</option>
              <option value="positive_out">Positive = money out</option>
            </select>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex gap-3 bg-muted/50 px-3 py-2">
          <span className="label-caps w-32 shrink-0">CSV column</span>
          <span className="label-caps flex-1">Sample</span>
          <span className="label-caps w-56 shrink-0">Maps to</span>
        </div>
        {Array.from({ length: columnCount }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size, never-reordered column list — position is the identity
            key={index}
            className="flex items-center gap-3 border-t px-3 py-2 text-[12.5px]"
          >
            <span className="w-32 shrink-0 truncate font-medium">
              {headerRow?.[index]?.trim() || `Column ${index + 1}`}
            </span>
            <span className="flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
              {sampleRow?.[index] ?? '—'}
            </span>
            <select
              data-testid={`import-mapping-role-${index}`}
              value={roles[index]}
              onChange={(event) =>
                setRole(index, event.target.value as ColumnRole)
              }
              className="h-8 w-56 shrink-0 rounded-md border bg-transparent px-2 text-sm"
            >
              {COLUMN_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          data-testid="import-mapping-confirm"
          disabled={confirm.isPending}
          onClick={submit}
        >
          {confirm.isPending ? 'Confirming…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

// --- step 3: preview + commit (one screen, per the wireframe) -----------

async function walkImportRows(importId: string): Promise<ImportRowOut[]> {
  return walkPages<ImportRowOut>(async (cursor) => {
    const { data } = await listImportRows({
      path: { import_id: importId },
      query: { cursor, limit: WALK_PAGE_SIZE },
      throwOnError: true,
    })
    return data
  })
}

/** The account's reviewed-but-uncategorized row count — the completion
 * state's before/after snapshot (import-model's `newlyUncategorized`). */
async function uncategorizedCount(accountId: string): Promise<number> {
  const rows = await walkPages(async (cursor) => {
    const { data } = await listTransactions({
      query: {
        account_id: [accountId],
        reviewed: true,
        uncategorized: true,
        cursor,
        limit: WALK_PAGE_SIZE,
      },
      throwOnError: true,
    })
    return data
  })
  return rows.length
}

function PreviewStep({
  batch,
  headerRow,
  matchedProfile,
  onCommitted,
}: {
  batch: ImportOut
  headerRow: string[] | null
  matchedProfile: boolean
  onCommitted: (result: {
    imported: number
    autoFile: boolean
    uncategorizedBefore: number
    unreviewedBefore: number
  }) => void
}) {
  const queryClient = useQueryClient()
  const rowsQuery = useQuery({
    queryKey: ['import-rows', batch.id],
    queryFn: () => walkImportRows(batch.id),
  })
  const [includedDuplicates, setIncludedDuplicates] = useState<Set<string>>(
    () => new Set(),
  )
  const [autoFile, setAutoFile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  const commit = useMutation({ ...commitImportMutation() })

  const rows = rowsQuery.data ?? []
  const validCount = rows.filter(rowIsValid).length
  const invalidCount = rows.length - validCount
  const duplicateCount = countDuplicateRows(rows)
  const includedCount = countIncludedRows(rows, includedDuplicates)
  const mapping: MappingSpec | null = batch.confirmed_mapping

  function toggleDuplicate(rowId: string) {
    setIncludedDuplicates((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  async function submit() {
    setError(null)
    setCommitting(true)
    try {
      // Snapshot before the commit lands — the completion state attributes
      // only THIS import's newly-uncategorized rows (import-model's
      // `newlyUncategorized`), not whatever the account already carried.
      const [uncategorizedBefore, statsBefore] = await Promise.all([
        autoFile ? uncategorizedCount(batch.account_id) : Promise.resolve(0),
        autoFile
          ? queryClient.fetchQuery({ ...ledgerStatsOptions(), staleTime: 0 })
          : Promise.resolve(null),
      ])
      const committed = await new Promise<ImportOut>((resolve, reject) => {
        commit.mutate(
          {
            path: { import_id: batch.id },
            body: commitPayload(rows, includedDuplicates, autoFile),
          },
          { onSuccess: resolve, onError: reject },
        )
      })
      queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
      queryClient.invalidateQueries({ queryKey: ledgerStatsQueryKey() })
      queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      onCommitted({
        imported: committed.transaction_count ?? 0,
        autoFile,
        uncategorizedBefore,
        unreviewedBefore: statsBefore?.unreviewed ?? 0,
      })
    } catch (mutationError) {
      setError(errorDetail(mutationError))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="grid gap-4">
      {matchedProfile && mapping && (
        <div
          className="rounded-lg border border-success/40 bg-success/10 p-3 text-[12.5px]"
          data-testid="import-profile-banner"
        >
          <p className="font-medium text-success">
            Matched a saved mapping profile — applied automatically
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {mappingSummaryLines(mapping, headerRow).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {rowsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading preview…</p>
      ) : (
        <>
          <p className="text-[12.5px] text-muted-foreground">
            {validCount} valid rows
            {duplicateCount > 0 &&
              ` · ${duplicateSummaryLine(duplicateCount, includedDuplicates.size)}`}
            {invalidCount > 0 && ` · ${invalidCount} rows couldn't be read`}
          </p>

          {duplicateCount > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-3 bg-muted/50 px-3 py-2">
                <span className="w-9 shrink-0" />
                <span className="label-caps w-24 shrink-0">Date</span>
                <span className="label-caps flex-1">Payee</span>
                <span className="label-caps w-24 shrink-0 text-right">
                  Amount
                </span>
              </div>
              {rows.filter(isOverridableDuplicate).map((row) => (
                <label
                  key={row.id}
                  data-testid="import-duplicate-row"
                  className="flex cursor-pointer items-center gap-3 border-t px-3 py-2 text-[12.5px] hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    className="w-9 shrink-0 accent-primary"
                    data-testid={`import-row-include-${row.id}`}
                    checked={includedDuplicates.has(row.id)}
                    onChange={() => toggleDuplicate(row.id)}
                  />
                  <span className="w-24 shrink-0 font-mono text-[11.5px]">
                    {row.date}
                  </span>
                  <span className="flex-1 truncate">{row.description_raw}</span>
                  <span className="amount w-24 shrink-0 text-right text-[11.5px]">
                    {row.amount_minor !== null
                      ? formatMinorUnits(row.amount_minor, row.currency)
                      : '—'}
                  </span>
                </label>
              ))}
            </div>
          )}

          <label className="flex items-start gap-2.5 rounded-lg border p-3">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              data-testid="import-auto-file-toggle"
              checked={autoFile}
              onChange={(event) => setAutoFile(event.target.checked)}
            />
            <span>
              <span className="block font-semibold text-[12.5px]">
                File these automatically using my rules and history
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                {autoFile
                  ? "Rows Penny can't categorize land reviewed, uncategorized — nothing waits in To review."
                  : 'Every imported row lands in To review for you to confirm.'}
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-muted-foreground">
              {includedCount} {includedCount === 1 ? 'row' : 'rows'} will be
              imported
            </span>
            <Button
              type="button"
              data-testid="import-commit"
              disabled={committing || includedCount === 0}
              onClick={submit}
            >
              {committing
                ? 'Importing…'
                : `Import ${includedCount} ${includedCount === 1 ? 'row' : 'rows'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// --- step 4a: settling (auto-file only — waiting for the classify job) ---

function SettlingStep({
  imported,
  accountId,
  uncategorizedBefore,
  unreviewedBefore,
  onSettled,
}: {
  imported: number
  accountId: string
  uncategorizedBefore: number
  unreviewedBefore: number
  onSettled: (stillUncategorized: number) => void
}) {
  // The onboarding wizard's own seam (ProgressStep): poll ledgerStats,
  // bounded, until the classify job's auto-file consumption brings the
  // ledger's unreviewed count back down to what it was before this
  // import's rows briefly bumped it — the settle signal, no new polling
  // surface (CONTEXT.md/PRD: reuse, don't invent). A raw imperative loop,
  // not `useQuery`: React Query would hand back the pre-commit snapshot
  // still sitting in cache as `data` on the very first render (stale
  // data shown while a revalidating fetch is in flight), which reads as
  // "already settled" against a baseline equal to itself — a false
  // positive the instant this step mounts. Every tick here is a genuine
  // network round trip, so the first check can't lie.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        const { data } = await ledgerStats({ throwOnError: true })
        if (cancelled) return
        if (data.unreviewed <= unreviewedBefore) break
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS))
        if (cancelled) return
      }
      const after = await uncategorizedCount(accountId)
      if (cancelled) return
      onSettled(newlyUncategorized(uncategorizedBefore, after))
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [accountId, uncategorizedBefore, unreviewedBefore, onSettled])

  return (
    <div
      className="flex flex-col items-center gap-3 py-6 text-center"
      data-testid="import-settling"
    >
      <div
        aria-hidden
        className="size-8 rounded-full bg-primary motion-safe:animate-pulse"
      />
      <p className="text-muted-foreground text-sm">
        Filing {imported} {imported === 1 ? 'row' : 'rows'} with your rules and
        history…
      </p>
    </div>
  )
}

// --- step 4b: done -------------------------------------------------------

function DoneStep({
  imported,
  stillUncategorized,
  onClose,
}: {
  imported: number
  stillUncategorized: number | null
  onClose: () => void
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-6 text-center"
      data-testid="import-done"
    >
      <p
        className="font-semibold text-[13px]"
        data-testid="import-complete-message"
      >
        {completionMessage(imported, stillUncategorized)}
      </p>
      {stillUncategorized !== null && stillUncategorized > 0 && (
        <Link
          to="/register"
          search={{ view: 'uncategorized' }}
          data-testid="import-uncategorized-link"
          className="text-primary text-sm underline underline-offset-2"
          onClick={onClose}
        >
          Review {stillUncategorized} uncategorized →
        </Link>
      )}
      {stillUncategorized === null && imported > 0 && (
        <Link
          to="/register"
          search={{ view: 'review' }}
          data-testid="import-review-link"
          className="text-primary text-sm underline underline-offset-2"
          onClick={onClose}
        >
          Review {imported} transactions →
        </Link>
      )}
      <Button type="button" className="mt-2" onClick={onClose}>
        Done
      </Button>
    </div>
  )
}
