import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/register')({
  staticData: { title: 'Register' },
  component: RegisterPage,
})

// F3 CP0: the Register mounts with its designed empty state — the ledger's
// column header (wireframe #8's Payee / Category / Amount voice) over an
// honest "nothing yet". The list, filters, and Inspector arrive in CP2.
function RegisterPage() {
  return (
    <div
      data-testid="register-empty"
      className="flex h-full flex-col overflow-hidden rounded-lg border"
    >
      <div className="flex gap-3.5 border-b bg-muted/50 px-4 py-2">
        <span className="label-caps flex-1">Payee</span>
        <span className="label-caps w-[120px]">Category</span>
        <span className="label-caps w-[90px] text-right">Amount</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="font-medium">No transactions yet</p>
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">
          Once an account starts syncing, every movement lands here —
          searchable, filterable, and editable in place.
        </p>
      </div>
    </div>
  )
}
