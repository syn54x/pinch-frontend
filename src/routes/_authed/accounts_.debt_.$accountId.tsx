import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import {
  getAccountOptions,
  getPayoffOptions,
  listAccountsOptions,
  listTransactionsOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { PayoffOut, TermsOut } from '@/api/generated/types.gen'
import { PayoffCurves } from '@/components/debt/payoff-curves'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { WarnChip } from '@/components/ui/warn-chip'
import { deriveTermMonths, formatMonthYear } from '@/lib/debt'
import { formatMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'

type PayoffSearch = { extra?: 200 | 500 }

export const Route = createFileRoute('/_authed/accounts_/debt_/$accountId')({
  staticData: { title: 'Loan' },
  validateSearch: (raw: Record<string, unknown>): PayoffSearch => {
    return raw.extra === 200 || raw.extra === 500 ? { extra: raw.extra } : {}
  },
  component: LoanDetailPage,
})

function payoffLabel(
  sim: { never_pays_off: boolean; payoff_date: string | null } | null,
): string {
  if (sim === null) return '—'
  if (sim.never_pays_off) return 'never at this rate'
  return sim.payoff_date === null ? '—' : formatMonthYear(sim.payoff_date)
}

function formatMonths(total: number): string {
  const years = Math.floor(total / 12)
  const months = total % 12
  const parts = []
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mo`)
  return parts.join(' ') || '0 mo'
}

// F5 CP4 (#31, wireframe s15/s15b): a loan's payoff timeline & scenarios. The
// headline is behavior vs. the contract — your real pace against the minimum.
// When terms aren't set the projection is gated honestly (real balance + recent
// payments, but never a fabricated date) with a path to add terms.
function LoanDetailPage() {
  const { accountId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const extraMonthly =
    search.extra !== undefined ? search.extra * 100 : undefined

  const payoffQuery = useQuery({
    ...getPayoffOptions({
      path: { account_id: accountId },
      query: { extra_monthly: extraMonthly },
    }),
    throwOnError: true,
  })
  const accountQuery = useQuery({
    ...getAccountOptions({ path: { account_id: accountId } }),
    throwOnError: true,
  })
  const accountsQuery = useQuery(listAccountsOptions())

  const payoff = payoffQuery.data
  const account = accountQuery.data
  if (payoff === undefined || account === undefined) return <DetailSkeleton />

  const currency = payoff.currency
  const siblings = (accountsQuery.data?.items ?? []).filter(
    (a) => a.kind === 'loan' || a.kind === 'credit',
  )
  const projections = payoff.projections

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/accounts/debt">
            <ChevronLeft aria-hidden /> Debt
          </Link>
        </Button>
        {siblings.length > 1 && (
          <select
            aria-label="Switch loan"
            value={accountId}
            onChange={(e) =>
              navigate({
                to: '/accounts/debt/$accountId',
                params: { accountId: e.target.value },
              })
            }
            className="rounded-md border bg-card px-2 py-1 text-sm"
          >
            {siblings.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <h1 className="font-heading font-medium text-xl">{account.label}</h1>

      {projections === null ? (
        <TermsNotSet
          payoff={payoff}
          accountId={accountId}
          currency={currency}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Balance"
              value={
                <span className="text-destructive">
                  {formatMinorUnits(payoff.balance_minor ?? 0, currency)}
                </span>
              }
              delta={payoff.apr === null ? undefined : `${payoff.apr}% APR`}
            />
            <StatTile
              label="At your pace"
              value={payoffLabel(projections.at_pace)}
              delta={`${formatMinorUnits(payoff.pace_payment_minor, currency)}/mo · 6-mo avg`}
            />
            <StatTile
              label="Minimum only"
              value={payoffLabel(projections.at_minimum)}
              delta={
                payoff.minimum_payment_minor === null
                  ? undefined
                  : `${formatMinorUnits(payoff.minimum_payment_minor, currency)}/mo`
              }
            />
          </div>

          {projections.headline !== null && (
            <div
              data-testid="debt-headline"
              className="rounded-xl bg-muted/40 p-4"
            >
              <div className="label-caps">You're on track to finish</div>
              <div className="amount mt-1 font-semibold text-success text-lg">
                {formatMonths(projections.headline.months_earlier)} early ·{' '}
                {formatMinorUnits(
                  projections.headline.interest_saved_minor,
                  currency,
                )}{' '}
                less interest
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Your behavior vs. the contract minimum.
              </p>
            </div>
          )}

          <TermsCard terms={account.terms} accountId={accountId} />

          <PayoffCurves projections={projections} currency={currency} />

          <WhatIf
            payoff={payoff}
            extra={search.extra}
            currency={currency}
            onPick={(next) =>
              navigate({
                search: { extra: next },
                replace: true,
              })
            }
          />
        </>
      )}

      {/* /accounts/debt/$accountId/terms renders here, over the detail. */}
      <Outlet />
    </div>
  )
}

function TermsCard({
  terms,
  accountId,
}: {
  terms: TermsOut | null
  accountId: string
}) {
  const term = deriveTermMonths(
    terms?.origination_date ?? null,
    terms?.maturity_date ?? null,
  )
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="label-caps">Loan terms</h2>
          <Badge variant="outline">manual</Badge>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/accounts/debt/$accountId/terms" params={{ accountId }}>
            Edit terms
          </Link>
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Term label="APR" value={terms?.apr != null ? `${terms.apr}%` : '—'} />
        <Term
          label="Minimum payment"
          value={
            terms?.minimum_payment_minor != null
              ? `${formatMinorUnits(terms.minimum_payment_minor, 'USD')} / mo`
              : '—'
          }
        />
        <Term
          label="Original principal"
          value={
            terms?.origination_amount_minor != null
              ? formatMinorUnits(terms.origination_amount_minor, 'USD')
              : '—'
          }
        />
        <Term label="Term" value={term !== null ? `${term} months` : '—'} />
        <Term
          label="Opened"
          value={
            terms?.origination_date != null
              ? formatMonthYear(terms.origination_date)
              : '—'
          }
        />
      </dl>
    </section>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="amount font-medium">{value}</dd>
    </div>
  )
}

function WhatIf({
  payoff,
  extra,
  currency,
  onPick,
}: {
  payoff: PayoffOut
  extra: 200 | 500 | undefined
  currency: string
  onPick: (extra: 200 | 500 | undefined) => void
}) {
  return (
    <section
      data-testid="debt-whatif"
      className="rounded-xl border border-dashed p-4"
    >
      <div className="label-caps">What if I paid</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {([200, 500] as const).map((amount) => {
          const active = extra === amount
          return (
            <button
              key={amount}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? undefined : amount)}
              className={cn(
                'rounded-full border px-3 py-1 font-medium text-sm transition-colors',
                active
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              +${amount}/mo
            </button>
          )
        })}
        {payoff.scenario !== null && (
          <span data-testid="debt-whatif-readout" className="text-sm">
            → finish{' '}
            <span className="font-semibold text-success">
              {payoff.scenario.months_sooner} mo sooner
            </span>{' '}
            · {formatMinorUnits(payoff.scenario.interest_saved_minor, currency)}{' '}
            less interest
          </span>
        )}
      </div>
    </section>
  )
}

function TermsNotSet({
  payoff,
  accountId,
  currency,
}: {
  payoff: PayoffOut
  accountId: string
  currency: string
}) {
  const payments = useQuery({
    ...listTransactionsOptions({
      query: { account_id: [accountId], limit: 5 },
    }),
  })
  const recent = (payments.data?.items ?? []).filter((t) => t.amount_minor > 0)

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <StatTile
          className="flex-1"
          label="Balance"
          value={
            <span className="text-destructive">
              {formatMinorUnits(payoff.balance_minor ?? 0, currency)}
            </span>
          }
        >
          <WarnChip>APR — · terms not set</WarnChip>
        </StatTile>
        <div className="flex flex-[2] flex-col items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <span className="label-caps text-warning">Payoff not projected</span>
          <p className="text-sm">
            Add APR &amp; minimum payment to see your payoff date and scenarios.
          </p>
          <Button asChild size="sm">
            <Link to="/accounts/debt/$accountId/terms" params={{ accountId }}>
              Add terms
            </Link>
          </Button>
        </div>
      </div>

      <section
        data-testid="debt-recent-payments"
        className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex items-center gap-2">
          <h2 className="label-caps">Recent payments</h2>
          <Badge variant="secondary">from register</Badge>
        </div>
        <div className="mt-2">
          {recent.length === 0 ? (
            <p className="py-3 text-muted-foreground text-sm">
              No payments recorded yet.
            </p>
          ) : (
            recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span className="text-muted-foreground">
                  Payment · {formatMonthYear(t.date)}
                </span>
                <span className="amount">
                  {formatMinorUnits(t.amount_minor, currency)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-[11.5px] text-muted-foreground">
        Balance &amp; payments are real from the register; only the derived
        projection is gated on terms — never a fabricated date.
      </p>
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}
