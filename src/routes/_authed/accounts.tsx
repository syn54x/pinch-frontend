import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut } from '@/api/generated/types.gen'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinorUnits } from '@/lib/money'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  // Non-401 failures (the interceptor owns those) throw to the _authed
  // error boundary rather than rendering a silent empty page.
  const accounts = useQuery({ ...listAccountsOptions(), throwOnError: true })

  return (
    <div>
      <h1 className="font-semibold text-xl">Accounts</h1>
      <div className="mt-4 space-y-3">
        {accounts.isPending ? (
          <AccountSkeletons />
        ) : accounts.data && accounts.data.items.length > 0 ? (
          accounts.data.items.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function AccountCard({ account }: { account: AccountOut }) {
  return (
    <Card data-testid="account-card">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-medium">{account.label}</span>
          <Badge variant="secondary">{account.kind}</Badge>
          {account.manual && <Badge variant="outline">manual</Badge>}
        </div>
        <span className="tabular-nums">
          {account.balance ? (
            formatMinorUnits(
              account.balance.amount_minor,
              account.balance.currency,
            )
          ) : (
            <span className="text-muted-foreground">No balance yet</span>
          )}
        </span>
      </CardContent>
    </Card>
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
          Connect a bank or import data with the Pinch CLI to get started.
        </p>
      </CardContent>
    </Card>
  )
}
