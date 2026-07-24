import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { listAccountsOptions } from '@/api/generated/@tanstack/react-query.gen'
import { TermsForm } from '@/components/debt/terms-form'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export const Route = createFileRoute('/_authed/accounts_/debt/add')({
  staticData: { title: 'Add loan' },
  component: AddLoanPage,
})

// "+ Add loan" — the same terms sheet with an account picker on top (over loan &
// credit accounts). No manual account creation here (that's Connect / Accounts);
// this attaches terms to a debt account you already have.
function AddLoanPage() {
  const navigate = Route.useNavigate()
  const accounts = useQuery(listAccountsOptions())
  const [pickedId, setPickedId] = useState('')

  const close = () => navigate({ to: '/accounts/debt' })
  const loans = (accounts.data?.items ?? []).filter(
    (a) => a.kind === 'loan' || a.kind === 'credit',
  )
  const picked = loans.find((a) => a.id === pickedId) ?? null

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent className="gap-5 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Add loan terms</SheetTitle>
          <SheetDescription>
            Pick a loan or card, then enter its terms.
          </SheetDescription>
        </SheetHeader>

        {loans.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No loan or credit accounts yet.{' '}
            <Link to="/connections" className="underline">
              Connect one
            </Link>{' '}
            and it'll appear here.
          </p>
        ) : picked !== null ? (
          <TermsForm account={picked} onDone={close} />
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="add-picker">Account</Label>
            <select
              id="add-picker"
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              className="rounded-md border bg-card px-2 py-2 text-sm"
            >
              <option value="" disabled>
                Choose a loan or card…
              </option>
              {loans.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
