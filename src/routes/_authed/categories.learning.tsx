import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  correctionLogStatsOptions,
  listCorrectionLogOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { CorrectionLogEntryOut } from '@/api/generated/types.gen'
import { ProvenanceBadge } from '@/components/review/provenance-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'

// F4 CP4 (#62, wireframe s21): the flywheel made visible, read-only. The
// tiles answer "is Pinch getting better at filing for me"; the feed shows
// what each self-contained log entry knows — proposal, provenance,
// decision — and nothing it doesn't. No verbs: recovery from any decision
// is editing the transaction again, never an undo.
export const Route = createFileRoute('/_authed/categories/learning')({
  component: LearningTab,
})

function LearningTab() {
  const stats = useQuery(correctionLogStatsOptions())
  const log = useQuery(listCorrectionLogOptions({ query: { limit: 100 } }))

  const groups = useMemo(() => groupBatches(log.data?.items ?? []), [log.data])

  if (stats.isPending || log.isPending) {
    return <Skeleton className="h-48 w-full" data-testid="learning-tab" />
  }
  const tiles = stats.data
  const pct = (value: number | null | undefined) =>
    value == null ? '—' : `${Math.round(value * 100)}%`
  return (
    <div className="max-w-2xl" data-testid="learning-tab">
      {tiles && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Corrections all-time"
            value={tiles.corrections_total}
            data-testid="tile-corrections"
          />
          <StatTile
            label="Proposals accepted untouched"
            value={pct(tiles.accepted_untouched_pct)}
            delta={
              tiles.previous_month_pct != null
                ? `was ${pct(tiles.previous_month_pct)} in ${previousMonthName()}`
                : undefined
            }
            data-testid="tile-untouched"
          />
          <StatTile
            label="Promoted to rules"
            value={tiles.promoted_rules_accepted}
            delta="with your consent"
            data-testid="tile-promoted"
          />
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {groups.map((group) =>
          group.kind === 'batch' ? (
            <li key={group.batchId} className="px-3.5 py-2.5">
              <details data-testid="learning-batch">
                <summary className="cursor-pointer text-sm">
                  A rule recategorized {group.entries.length} transactions
                  <span className="ml-2 text-muted-foreground text-xs">
                    {entryDate(group.entries[0])}
                  </span>
                </summary>
                <ul className="mt-1.5 grid gap-1 pl-4">
                  {group.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="text-muted-foreground text-xs"
                    >
                      {entry.input_payee?.toUpperCase()} →{' '}
                      {entry.decision_category_name ?? 'Uncategorized'}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ) : (
            <li
              key={group.entry.id}
              className="px-3.5 py-2.5"
              data-testid="learning-entry"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium font-mono text-[12.5px]">
                  {group.entry.input_payee?.toUpperCase() ?? '—'}
                </span>
                {group.entry.proposal_provenance &&
                  group.entry.proposal_provenance !== 'none' && (
                    <ProvenanceBadge
                      provenance={group.entry.proposal_provenance}
                    />
                  )}
                <span className="ml-auto text-muted-foreground text-xs">
                  {entryDate(group.entry)}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {sentence(group.entry)}
              </p>
            </li>
          ),
        )}
        {groups.length === 0 && (
          <li className="px-3.5 py-6 text-center text-muted-foreground text-sm">
            Decisions you make reviewing land here — the flywheel's memory.
          </li>
        )}
      </ul>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        read-only log — corrections feed history matching & AI; streaks get
        promoted to suggested rules
      </p>
    </div>
  )
}

type FeedGroup =
  | { kind: 'batch'; batchId: string; entries: CorrectionLogEntryOut[] }
  | { kind: 'single'; entry: CorrectionLogEntryOut }

/** Newest first; a full-tier retro-apply collapses to one row on its
 * batch id. Void entries are bookkeeping, not decisions — not rendered. */
function groupBatches(items: CorrectionLogEntryOut[]): FeedGroup[] {
  const decisions = items.filter((entry) => entry.kind === 'decision')
  const batches = new Map<string, CorrectionLogEntryOut[]>()
  const groups: FeedGroup[] = []
  for (const entry of decisions) {
    if (entry.batch_id) {
      const existing = batches.get(entry.batch_id)
      if (existing) {
        existing.push(entry)
        continue
      }
      const fresh = [entry]
      batches.set(entry.batch_id, fresh)
      groups.push({ kind: 'batch', batchId: entry.batch_id, entries: fresh })
    } else {
      groups.push({ kind: 'single', entry })
    }
  }
  return groups.reverse()
}

function sentence(entry: CorrectionLogEntryOut): string {
  const proposed = entry.proposal_category_name ?? 'uncategorized'
  const decided = entry.decision_category_name ?? 'uncategorized'
  if (entry.decision_splits) return 'you split it across categories'
  if (entry.decision_transfer) return 'filed as a transfer'
  if (entry.accepted_untouched) return `accepted as proposed — ${decided}`
  if (entry.actor === 'auto')
    return `auto-filed from your precedent — ${decided}`
  return `you corrected the proposal ${proposed} → ${decided}`
}

function entryDate(entry: CorrectionLogEntryOut): string {
  return new Date(entry.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function previousMonthName(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(
    undefined,
    { month: 'long' },
  )
}
