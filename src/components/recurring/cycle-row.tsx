import type { RecurringSeriesOut } from '@/api/generated/types.gen'
import { WarnChip } from '@/components/ui/warn-chip'
import { formatMinorUnits } from '@/lib/money'
import {
  cycleStatusText,
  cycleStatusTone,
  isPaidDimmed,
  monthLabel,
} from '@/lib/recurring'
import { cn } from '@/lib/utils'

const TONE_CLASS = {
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
  destructive: 'text-destructive',
  warning: 'text-warning',
} as const

// The stacked date badge on the left of a cycle row — the cycle's anchor date
// (last paid for a settled/lapsed row, next due otherwise).
function DateStub({ iso }: { iso: string | null }) {
  if (iso === null) {
    return <div className="w-9 shrink-0" aria-hidden />
  }
  return (
    <div className="w-9 shrink-0 text-center" aria-hidden>
      <div className="label-caps">{monthLabel(iso)}</div>
      <div className="font-medium text-sm leading-tight">
        {iso.slice(8, 10)}
      </div>
    </div>
  )
}

// One "This cycle" row (s12). Row click opens the curation drawer. The status
// line and its ink carry the cycle state (paid recedes; due asks; overdue is a
// problem; lapsed nudges toward dismiss). Amounts stay hueless except income,
// which reads positive.
export function CycleRow({
  series,
  currency,
  onOpen,
}: {
  series: RecurringSeriesOut
  currency: string
  onOpen: () => void
}) {
  const { state } = series
  const dimmed = isPaidDimmed(series)
  const income = series.direction > 0
  const anchorIso =
    state.status === 'paid' || state.status === 'lapsed'
      ? state.last_paid_date
      : state.next_due_date
  const amount = state.est_amount_minor ?? series.amount_minor ?? 0
  const tone = cycleStatusTone(state.status)

  return (
    <button
      type="button"
      data-testid="recurring-row"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 border-b py-2.5 text-left last:border-b-0',
        dimmed && 'opacity-70',
      )}
    >
      <DateStub iso={anchorIso} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[13px]">
            {series.display_name}
          </span>
          {state.status === 'lapsed' && <WarnChip>lapsed</WarnChip>}
          {!state.fixed && !income && state.status !== 'lapsed' && (
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">
              ~ varies
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px]">
          <span className="rounded-[4px] bg-muted px-1.5 py-px text-muted-foreground">
            {series.bucket ?? 'Uncategorized'}
          </span>
          <span className={TONE_CLASS[tone]}>
            {cycleStatusText(series, currency)}
          </span>
        </div>
      </div>
      <span
        className={cn('amount shrink-0 text-[13px]', income && 'text-success')}
      >
        {formatMinorUnits(amount, currency)}
      </span>
    </button>
  )
}
