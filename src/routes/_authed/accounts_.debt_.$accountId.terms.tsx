import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getAccountOptions } from '@/api/generated/@tanstack/react-query.gen'
import { TermsForm } from '@/components/debt/terms-form'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export const Route = createFileRoute(
  '/_authed/accounts_/debt_/$accountId/terms',
)({
  staticData: { title: 'Edit terms' },
  component: EditTermsPage,
})

// The edit-terms sheet (s15c), route-driven over the loan detail. Closing (Esc /
// scrim / Cancel / Save) returns to the loan.
function EditTermsPage() {
  const { accountId } = Route.useParams()
  const navigate = Route.useNavigate()
  const account = useQuery({
    ...getAccountOptions({ path: { account_id: accountId } }),
    throwOnError: true,
  })

  const close = () =>
    navigate({ to: '/accounts/debt/$accountId', params: { accountId } })

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent className="gap-5 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Edit terms</SheetTitle>
          <SheetDescription>
            Entered by hand and stored as manual.
          </SheetDescription>
        </SheetHeader>
        {account.data !== undefined && (
          <TermsForm account={account.data} onDone={close} />
        )}
      </SheetContent>
    </Sheet>
  )
}
