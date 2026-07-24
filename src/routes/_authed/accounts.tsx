import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  accountBalanceMinor,
  groupAccounts,
  primaryCurrency,
  totalBalanceMinor,
} from '@/lib/accounts'
import { formatMinorUnits } from '@/lib/money'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authed/accounts')({
  staticData: { title: 'Accounts' },
  component: AccountsPage,
})

function isDebtAccount(account: AccountOut): boolean {
  return account.kind === 'loan' || account.kind === 'credit'
}

/** The row's honest sub-line from the fields we actually have: a loan's APR, and
 * when the balance was last observed (entered by hand vs synced). */
function accountSubline(account: AccountOut): string {
  const parts: string[] = []
  if (isDebtAccount(account) && account.terms?.apr != null) {
    parts.push(`${account.terms.apr}% APR`)
  }
  if (account.balance !== null) {
    const when = relativeTime(account.balance.as_of)
    parts.push(account.manual ? `manual · ${when}` : `synced ${when}`)
  }
  return parts.join(' · ')
}

// The Accounts surface (wireframe s-Accounts): every account grouped by category
// with a subtotal, over a running total. Debt lives under Accounts now — the
// Liabilities section and each loan row open the Debt view.
function AccountsPage() {
  // Non-401 failures (the interceptor owns those) throw to the _authed error
  // boundary rather than rendering a silent empty page.
  const accounts = useQuery({ ...listAccountsOptions(), throwOnError: true })

  if (accounts.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AccountSkeletons />
      </div>
    )
  }

  const items = accounts.data?.items ?? []
  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState />
      </div>
    )
  }

  const currency = primaryCurrency(items)
  const groups = groupAccounts(items)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="label-caps">Total across {items.length} accounts</div>
          <div className="amount mt-0.5 font-semibold text-3xl">
            {formatMinorUnits(totalBalanceMinor(items), currency)}
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/connections">Connect bank</Link>
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-baseline gap-2 font-medium text-sm">
              {group.label}
              <span className="amount text-muted-foreground text-xs">
                {formatMinorUnits(group.subtotalMinor, currency)}
              </span>
            </h2>
            {group.key === 'liabilities' && (
              <Link
                to="/accounts/debt"
                className="text-muted-foreground text-xs hover:text-foreground"
              >
                Debt view — payoff &amp; scenarios →
              </Link>
            )}
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {group.accounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AccountRow({ account }: { account: AccountOut }) {
  const debt = isDebtAccount(account)
  const amount = accountBalanceMinor(account)
  const subline = accountSubline(account)

  const inner = (
    <div
      data-testid="account-card"
      className={cn(
        'flex items-center gap-3 border-b p-4 last:border-b-0',
        debt && 'transition-colors hover:bg-muted/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{account.label}</span>
          {account.mask && (
            <span className="shrink-0 text-muted-foreground text-xs">
              ···{account.mask}
            </span>
          )}
        </div>
        {subline !== '' && (
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {subline}
          </div>
        )}
      </div>
      {account.balance ? (
        <span
          className={cn(
            'amount shrink-0 text-sm',
            amount < 0 && 'text-destructive',
          )}
        >
          {formatMinorUnits(amount, account.balance.currency)}
        </span>
      ) : (
        <span className="shrink-0 text-muted-foreground text-sm">
          No balance yet
        </span>
      )}
      {debt && (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  )

  // Loans & cards deep-link into the Debt view for their payoff timeline.
  return debt ? (
    <Link
      to="/accounts/debt/$accountId"
      params={{ accountId: account.id }}
      className="block"
    >
      {inner}
    </Link>
  ) : (
    inner
  )
}

function AccountSkeletons() {
  return (
    <>
      {[1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-16 w-full rounded-xl" />
      ))}
    </>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground text-sm">
        <p className="font-medium text-foreground">No accounts yet</p>
        <p className="mt-1">
          <Link to="/connections" className="underline">
            Connect a bank
          </Link>{' '}
          or import data with the Pinch CLI to get started.
        </p>
      </CardContent>
    </Card>
  )
}
