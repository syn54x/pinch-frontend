import { Link } from '@tanstack/react-router'
import type { Delta, NetWorthOut } from '@/api/generated/types.gen'
import { CollectingHistory } from '@/components/accounts/collecting-history'
import { NetWorthChart } from '@/components/accounts/net-worth-chart'
import { ChartA11y } from '@/components/chart-a11y'
import { Grid } from '@/components/charts/grid'
import { Line } from '@/components/charts/line'
import { LineChart } from '@/components/charts/line-chart'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { WarnChip } from '@/components/ui/warn-chip'
import { deriveAssetsDebts, indexToStart } from '@/lib/assets-debts'
import { formatMonthYear } from '@/lib/dates'
import { formatMinorUnits } from '@/lib/money'
import {
  collectingHistory,
  deltaGlyph,
  deltaTone,
  formatDeltaPercent,
  historySpanLabel,
  NET_WORTH_RANGES,
  type NetWorthRange,
  rangeSinceLabel,
} from '@/lib/net-worth'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'

// The Accounts overview card (F10 CP2, wireframes 1l/4f/3b): Net worth and
// Assets vs debts as tabs over one chart panel, with the range chips shared
// between them. The "What moved it" tab is F12's — the bar ships without it.
// Everything here reads the net-worth report; the grouped account list below
// the card stays on the accounts list (it owns masks, sublines, and verbs).

export type AccountsTab = 'net-worth' | 'assets-debts'

const TABS: { value: AccountsTab; label: string }[] = [
  { value: 'net-worth', label: 'Net worth' },
  { value: 'assets-debts', label: 'Assets vs debts' },
]

export function AccountsOverview({
  data,
  tab,
  range,
  onTabChange,
  onRangeChange,
}: {
  data: NetWorthOut
  tab: AccountsTab
  range: NetWorthRange
  onTabChange: (tab: AccountsTab) => void
  onRangeChange: (range: NetWorthRange) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Accounts view" className="flex gap-1">
          {TABS.map((option) => {
            const active = option.value === tab
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="accounts-overview-panel"
                onClick={() => onTabChange(option.value)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 font-medium text-[12.5px] transition-colors',
                  active
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <SegmentedControl
          aria-label="Range"
          className="ml-auto shrink-0"
          value={range}
          options={NET_WORTH_RANGES}
          onChange={onRangeChange}
        />
      </div>
      <div id="accounts-overview-panel" role="tabpanel">
        {tab === 'net-worth' ? (
          <NetWorthPanel data={data} range={range} />
        ) : (
          <AssetsDebtsPanel data={data} range={range} />
        )}
      </div>
    </section>
  )
}

// The Net worth tab (1l, and s11's machinery carried over): hero + delta, the
// history area with Penny's gated projection, the collecting-history early
// state (3b), and the excluded-currency honesty note.
function NetWorthPanel({
  data,
  range,
}: {
  data: NetWorthOut
  range: NetWorthRange
}) {
  const { currency, series } = data
  const collecting = collectingHistory(series, range)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-testid="nw-hero" className="amount font-semibold text-3xl">
          {formatMinorUnits(data.net_worth_minor, currency)}
        </span>
        {series.length > 0 &&
          (collecting ? (
            <>
              <span className="text-[12.5px] text-muted-foreground">today</span>
              <WarnChip className="ml-auto" data-testid="nw-history-span">
                {historySpanLabel(series)}
              </WarnChip>
            </>
          ) : (
            <>
              <HeroDelta
                delta={data.since_range_start}
                range={range}
                currency={currency}
              />
              <span className="ml-auto text-[11.5px] text-muted-foreground">
                {data.accounts.length} account
                {data.accounts.length === 1 ? '' : 's'} · assets minus debts
              </span>
            </>
          ))}
      </div>

      {series.length === 0 ? (
        <EmptyNetWorth />
      ) : collecting ? (
        <CollectingHistory series={series} currency={currency} range={range} />
      ) : (
        <NetWorthChart
          series={series}
          projection={data.projection}
          currency={currency}
        />
      )}

      <ExcludedNote data={data} />
    </div>
  )
}

// The Assets vs debts tab (4f): both lines client-derived from the report's
// per-account series and indexed to the range start — assets in ink, debts (as
// magnitude) in the negative tone, so paydown dips below $0 and the fan
// opening up *is* net worth growth; the gap reads it off exactly.
function AssetsDebtsPanel({
  data,
  range,
}: {
  data: NetWorthOut
  range: NetWorthRange
}) {
  const { currency, series } = data
  const collecting = collectingHistory(series, range)
  const indexed = indexToStart(deriveAssetsDebts(data.accounts))
  const first = indexed[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-testid="nw-hero" className="amount font-semibold text-3xl">
          {formatMinorUnits(data.net_worth_minor, currency)}
        </span>
        {series.length > 0 && (
          <HeroDelta
            delta={data.since_range_start}
            range={range}
            currency={currency}
          />
        )}
        <span
          data-testid="avd-legend"
          className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] bg-foreground"
            />
            Assets{' '}
            <span className="amount">
              {formatMinorUnits(data.assets_minor, currency)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] bg-destructive"
            />
            Debts{' '}
            <span className="amount">
              {formatMinorUnits(data.liabilities_minor, currency)}
            </span>
          </span>
        </span>
      </div>

      {series.length === 0 ? (
        <EmptyNetWorth />
      ) : collecting ? (
        <CollectingHistory series={series} currency={currency} range={range} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="mb-2 text-[11.5px] text-muted-foreground">
              change since{' '}
              {first ? formatMonthYear(first.date) : 'the range start'} — both
              lines start at $0
            </p>
            <ChartA11y
              summary={`Assets and debts since ${
                first ? formatMonthYear(first.date) : 'the range start'
              }, each as change from the start of the range. The gap between the lines is the net worth change: ${formatMinorUnits(
                data.since_range_start.delta_minor,
                currency,
              )}.`}
              table={{
                caption:
                  'Change since the start of the range; debts as magnitude, so paydown is negative.',
                columns: ['Date', 'Assets change', 'Debts change'],
                rows: indexed.map((p) => [
                  p.date,
                  formatMinorUnits(p.assets_minor, currency),
                  formatMinorUnits(p.debts_minor, currency),
                ]),
              }}
            >
              <LineChart
                data={indexed.map((p) => ({
                  date: new Date(p.date),
                  assets: p.assets_minor,
                  debts: p.debts_minor,
                }))}
                xDataKey="date"
                aspectRatio="16 / 5"
              >
                <Grid />
                <Line
                  dataKey="debts"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                />
                <Line
                  dataKey="assets"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ChartA11y>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            <span aria-hidden>↑ </span>indexed to the start of the range — the
            gap between the lines is the net worth change
          </p>
        </div>
      )}

      <ExcludedNote data={data} />
    </div>
  )
}

function HeroDelta({
  delta,
  range,
  currency,
}: {
  delta: Delta
  range: NetWorthRange
  currency: string
}) {
  const tone = deltaTone(delta.delta_minor)
  const percent = formatDeltaPercent(delta)
  return (
    <span className={cn('amount text-sm', TONE_CLASS[tone])}>
      {deltaGlyph(delta.delta_minor)}{' '}
      {formatMinorUnits(Math.abs(delta.delta_minor), currency)}
      {percent !== null && ` · ${percent}`}{' '}
      <span className="text-muted-foreground">{rangeSinceLabel(range)}</span>
    </span>
  )
}

function ExcludedNote({ data }: { data: NetWorthOut }) {
  if (data.excluded.length === 0) return null
  return (
    <p
      data-testid="nw-excluded-note"
      className="text-[11.5px] text-muted-foreground"
    >
      Excludes{' '}
      {data.excluded
        .map((e) => formatMinorUnits(e.balance_minor, e.currency))
        .join(', ')}{' '}
      — no {data.currency} rate to convert them yet.
    </p>
  )
}

function EmptyNetWorth() {
  return (
    <div className="flex flex-col items-center rounded-xl bg-card py-10 text-center ring-1 ring-foreground/10">
      <p className="font-medium">No net worth to chart yet</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        Connect a bank or add an account and its balances, and your net worth
        and its trend will build here.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/connections">Connect a bank</Link>
      </Button>
    </div>
  )
}
