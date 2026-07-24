import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { debtReportOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { DebtLoanRow } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { WarnChip } from '@/components/ui/warn-chip'
import { formatMonthYear } from '@/lib/debt'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authed/accounts_/debt')({
  staticData: { title: 'Debt' },
  component: DebtListPage,
})

function needsTerms(loan: DebtLoanRow): boolean {
  return loan.apr === null || loan.minimum_payment_minor === null
}

// F5 CP4 (#31, wireframe s14/s14e): the debt view — payoff & scenarios across
// every loan and card. Partial data annotates, never lies: a loan missing terms
// is excluded from the aggregate it can't inform (with a warn marker saying so)
// and wears an "add terms" row instead of a fabricated payoff. Entered from
// Accounts; no nav item of its own.
function DebtListPage() {
  const report = useQuery({ ...debtReportOptions(), throwOnError: true })

  const debt = report.data
  if (debt === undefined) return <DebtSkeleton />

  const currency = debt.currency
  const missing = debt.loans.filter(needsTerms)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/accounts">
            <ChevronLeft aria-hidden /> Accounts
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/accounts/debt/add">
            <Plus aria-hidden /> Add loan
          </Link>
        </Button>
      </div>

      {debt.loan_count === 0 ? (
        <DebtEmpty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Total debt"
              value={
                <span className="text-destructive">
                  {formatMinorUnits(debt.total_debt_minor, currency)}
                </span>
              }
              delta={`${debt.loan_count} loans`}
            />
            <StatTile
              label="Monthly minimums"
              value={formatMinorUnits(debt.monthly_minimums_minor, currency)}
            >
              {debt.minimums_excluded_count > 0 && (
                <WarnChip>
                  {debt.minimums_excluded_count} loan
                  {debt.minimums_excluded_count > 1 ? 's' : ''} missing
                </WarnChip>
              )}
            </StatTile>
            <StatTile
              label="Weighted APR"
              value={debt.weighted_apr === null ? '—' : `${debt.weighted_apr}%`}
            >
              {debt.apr_excluded_count > 0 && (
                <WarnChip>{debt.apr_excluded_count} missing terms</WarnChip>
              )}
            </StatTile>
            <StatTile
              label="Debt-free by"
              value={
                debt.debt_free_excluded_count > 0 || debt.debt_free_by === null
                  ? '—'
                  : formatMonthYear(debt.debt_free_by)
              }
              delta={
                debt.debt_free_excluded_count > 0
                  ? 'add terms to project'
                  : undefined
              }
            />
          </div>

          {missing.length > 0 && (
            <div
              data-testid="debt-missing-banner"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4"
            >
              <WarnChip>
                {missing.length} loan{missing.length > 1 ? 's' : ''} need terms
              </WarnChip>
              <p className="min-w-0 flex-1 text-muted-foreground text-sm">
                Payoff projections skip loans without terms — add APR &amp;
                minimum payment to include{' '}
                {missing.map((l) => l.label).join(', ')}.
              </p>
            </div>
          )}

          <p className="text-[11.5px] text-muted-foreground">
            Pace is the 6-month average of your real payments · open a loan for
            its timeline &amp; scenarios.
          </p>

          <section className="rounded-xl bg-card ring-1 ring-foreground/10">
            {debt.loans.map((loan) => (
              <LoanRow key={loan.id} loan={loan} currency={currency} />
            ))}
          </section>
        </>
      )}

      {/* /accounts/debt/add renders here, over the list. */}
      <Outlet />
    </div>
  )
}

function LoanRow({ loan, currency }: { loan: DebtLoanRow; currency: string }) {
  const missing = needsTerms(loan)
  return (
    <Link
      to="/accounts/debt/$accountId"
      params={{ accountId: loan.id }}
      data-testid="debt-loan-row"
      className={cn(
        'flex items-center gap-4 border-b p-4 last:border-b-0 hover:bg-muted/40',
        missing && 'border-l-2 border-l-warning',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{loan.label}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-muted-foreground">
          <span>{loan.apr === null ? 'APR —' : `${loan.apr}% APR`}</span>
          <span className="amount">
            {loan.balance_minor === null
              ? '—'
              : formatMinorUnits(loan.balance_minor, currency)}
          </span>
          <span>
            {loan.minimum_payment_minor === null
              ? 'min —'
              : `${formatMinorUnits(loan.minimum_payment_minor, currency)}/mo`}
          </span>
        </div>
      </div>

      {missing ? (
        <WarnChip>Add terms</WarnChip>
      ) : (
        <div className="flex items-center gap-3">
          <span className="amount text-[11.5px] text-muted-foreground">
            ↓ {formatMinorUnits(loan.pace_payment_minor, currency)}/mo
          </span>
          {loan.payoff_percent !== null && (
            <ProgressRing
              value={loan.payoff_percent / 100}
              size={40}
              thickness={5}
              label={`${loan.label} ${Math.round(loan.payoff_percent)}% paid off`}
            />
          )}
        </div>
      )}
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function DebtEmpty() {
  return (
    <div
      data-testid="debt-empty"
      className="flex flex-col items-center rounded-xl border border-dashed p-10 text-center"
    >
      <div className="size-11 rounded-lg bg-muted" aria-hidden />
      <p className="mt-4 font-medium">No debt accounts</p>
      <p className="mt-1 max-w-md text-muted-foreground text-sm">
        When you connect a credit card or loan, each one appears here with
        balance, APR, and a payoff timeline built from your real payments.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button asChild size="sm">
          <Link to="/connections">Connect a card or loan</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/accounts/debt/add">
            <Plus aria-hidden /> Add loan manually
          </Link>
        </Button>
      </div>
    </div>
  )
}

function DebtSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Skeleton className="h-8 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['a', 'b', 'c', 'd'].map((k) => (
          <Skeleton key={k} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
