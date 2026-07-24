import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  listRecurringOptions,
  recurringReportOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { RecurringKind } from '@/api/generated/types.gen'
import { CurationDrawer } from '@/components/recurring/curation-drawer'
import { CycleRow } from '@/components/recurring/cycle-row'
import { RecurringDonut } from '@/components/recurring/recurring-donut'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

type RecurringSearch = { kind?: RecurringKind; unpaid?: boolean }

const KIND_CHIPS: { value: RecurringKind; label: string }[] = [
  { value: 'bill', label: 'Bills' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'income', label: 'Income' },
]

export const Route = createFileRoute('/_authed/recurring')({
  staticData: { title: 'Recurring' },
  // Filters live in the URL; a malformed hand-edit degrades to no filter.
  validateSearch: (raw: Record<string, unknown>): RecurringSearch => {
    const search: RecurringSearch = {}
    if (
      raw.kind === 'bill' ||
      raw.kind === 'subscription' ||
      raw.kind === 'income'
    ) {
      search.kind = raw.kind
    }
    if (raw.unpaid === true || raw.unpaid === 'true') search.unpaid = true
    return search
  },
  component: RecurringPage,
})

// F5 CP3 (#30, wireframe s12/s12e): what recurring life costs — the monthly
// total, what's due, subscriptions, split by category — with a "This cycle" list
// across all five cycle states. Tiles + donut are always the unfiltered summary;
// the kind/unpaid filters scope only the list. Detection is the data's verdict —
// nothing is fabricated, and there's no "add recurring" by design.
function RecurringPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const report = useQuery({
    ...recurringReportOptions(),
    throwOnError: true,
  })
  const list = useQuery({
    ...listRecurringOptions({
      query: { kind: search.kind, unpaid: search.unpaid, limit: 100 },
    }),
    placeholderData: keepPreviousData,
    throwOnError: true,
  })

  const summary = report.data
  if (summary === undefined) return <RecurringSkeleton />
  const currency = 'USD'

  // Nothing detected yet (s12e): no active series at all. Real $0 still renders;
  // this is the "no pattern found" state, not an empty wallet.
  if (summary.cycle.total === 0) return <RecurringEmpty />

  const items = list.data?.items ?? []
  const selected = items.find((s) => s.id === selectedId) ?? null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div data-testid="recurring-tiles" className="grid grid-cols-3 gap-3">
        <StatTile
          label="Monthly recurring"
          value={formatMinorUnits(summary.monthly_recurring_minor, currency)}
        />
        <StatTile
          label="Due next 7 days"
          value={formatMinorUnits(summary.due_next_7_days_minor, currency)}
        />
        <StatTile
          label="Subscriptions"
          value={formatMinorUnits(
            summary.subscriptions.monthly_minor,
            currency,
          )}
          delta={`/mo · ${summary.subscriptions.count}`}
          deltaTone="muted"
        />
      </div>

      {summary.by_bucket.length > 0 && (
        <RecurringDonut buckets={summary.by_bucket} currency={currency} />
      )}

      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="label-caps">This cycle</h2>
            <span className="text-[11.5px] text-muted-foreground">
              {summary.cycle.paid} of {summary.cycle.total} paid
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {KIND_CHIPS.map((chip) => {
                const active = search.kind === chip.value
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          kind: active ? undefined : chip.value,
                        }),
                        replace: true,
                      })
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 font-medium text-xs transition-colors',
                      active
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>
            <fieldset
              aria-label="Paid filter"
              className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
            >
              {[
                { unpaid: undefined, label: 'All' },
                { unpaid: true as const, label: 'Unpaid' },
              ].map((opt) => {
                const active =
                  (search.unpaid ?? false) === (opt.unpaid ?? false)
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      navigate({
                        search: (prev) => ({ ...prev, unpaid: opt.unpaid }),
                        replace: true,
                      })
                    }
                    className={cn(
                      'rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
                      active
                        ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </fieldset>
          </div>
        </div>

        <div className="mt-2">
          {items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No series match this filter.
            </p>
          ) : (
            items.map((series) => (
              <CycleRow
                key={series.id}
                series={series}
                currency={currency}
                onOpen={() => setSelectedId(series.id)}
              />
            ))
          )}
        </div>
      </section>

      <CurationDrawer series={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function RecurringEmpty() {
  return (
    <div
      data-testid="recurring-empty"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
    >
      <div className="flex flex-col items-center rounded-xl border border-dashed p-10 text-center">
        <div className="size-11 rounded-lg bg-muted" aria-hidden />
        <p className="mt-4 font-medium">No recurring items detected yet</p>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          Pinch finds bills, subscriptions, and paychecks by spotting patterns
          across your history — there's no manual setup. Penny needs to watch a
          charge repeat (usually two or three cycles) before it appears here.
        </p>
      </div>
      <p className="text-center text-[11.5px] text-muted-foreground">
        Detections gate until there's a pattern — no fabricated series, and no
        "add recurring" button by design.
      </p>
    </div>
  )
}

function RecurringSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
