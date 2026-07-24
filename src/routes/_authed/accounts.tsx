import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut } from '@/api/generated/types.gen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinorUnits } from '@/lib/money'

function isDebtAccount(account: AccountOut): boolean {
  return account.kind === 'loan' || account.kind === 'credit'
}

export const Route = createFileRoute('/_authed/accounts')({
  staticData: { title: 'Accounts' },
  component: AccountsPage,
})

function AccountsPage() {
  // Non-401 failures (the interceptor owns those) throw to the _authed
  // error boundary rather than rendering a silent empty page.
  const accounts = useQuery({ ...listAccountsOptions(), throwOnError: true })

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="space-y-3">
        {accounts.isPending ? (
          <AccountSkeletons />
        ) : accounts.data && accounts.data.items.length > 0 ? (
          <>
            {accounts.data.items.some(isDebtAccount) && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full justify-between"
              >
                <Link to="/accounts/debt">
                  Debt view — payoff &amp; scenarios
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            )}
            {accounts.data.items.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function AccountCard({ account }: { account: AccountOut }) {
  const debt = isDebtAccount(account)
  const card = (
    <Card
      data-testid="account-card"
      className={debt ? 'transition-colors hover:bg-muted/40' : undefined}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{account.label}</span>
          {account.mask && (
            <span className="text-muted-foreground text-sm">
              ···{account.mask}
            </span>
          )}
          <Badge variant="secondary">{account.kind}</Badge>
          {account.manual && <Badge variant="outline">manual</Badge>}
        </div>
        {account.balance ? (
          <span className="amount ml-auto text-sm">
            {formatMinorUnits(
              account.balance.amount_minor,
              account.balance.currency,
            )}
          </span>
        ) : (
          <span className="ml-auto text-muted-foreground text-sm">
            No balance yet
          </span>
        )}
      </CardContent>
    </Card>
  )

  // Loans & cards deep-link into the Debt view for their payoff timeline.
  return debt ? (
    <Link
      to="/accounts/debt/$accountId"
      params={{ accountId: account.id }}
      className="block"
    >
      {card}
    </Link>
  ) : (
    card
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
