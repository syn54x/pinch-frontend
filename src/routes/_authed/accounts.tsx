import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  // Raw list for the tracer — CP3 (#5) grows this into the real screen.
  const accounts = useQuery(listAccountsOptions())

  return (
    <div>
      <h1 className="text-xl font-semibold">Accounts</h1>
      <ul className="mt-4 space-y-2">
        {accounts.data?.items.map((account) => (
          <li key={account.id}>{account.label}</li>
        ))}
      </ul>
    </div>
  )
}
