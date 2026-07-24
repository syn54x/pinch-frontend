import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The Dashboard's empty ledger (wireframe s6e, PRD empty-state law): no
// accounts yet, so no wall of zeros — one job, connect an account. The
// onboarding wizard (its currency → connect → sync flow) lives on the Inbox,
// so both CTAs route there; the dashboard stays honest about having nothing to
// show. Penny's read and the activity card explain what fills in once data
// flows, without faking any number.
export function DashboardEmpty({ name }: { name: string }) {
  return (
    <div
      data-testid="dashboard-empty"
      className="mx-auto flex w-full max-w-3xl flex-col gap-5"
    >
      <div>
        <h2 className="font-semibold text-2xl">
          Welcome to Pinch{name ? `, ${name}` : ''}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Let's get your ledger started — about a minute.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-11 text-center">
        <div aria-hidden className="size-11 rounded-xl bg-muted" />
        <p className="font-semibold text-base">Connect your first account</p>
        <p className="max-w-md text-muted-foreground text-sm leading-relaxed">
          Link a bank, card, or loan and Pinch pulls in balances and
          transactions automatically. Prefer to start by hand? Add an account
          manually.
        </p>
        <div className="mt-1 flex gap-2">
          <Link
            to="/inbox"
            className={cn(buttonVariants({ size: 'sm' }))}
            data-testid="dashboard-empty-connect"
          >
            Connect an account
          </Link>
          <Link
            to="/inbox"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Add manually
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <section className="flex flex-1 flex-col gap-2 rounded-xl bg-penny/5 p-4 ring-1 ring-penny/15 dark:bg-penny/10">
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-5 rounded-full bg-penny" />
            <span className="font-medium text-sm">Penny's read</span>
          </div>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Once accounts are connected, Penny writes a plain-language summary
            of your money here — nothing to summarize yet.
          </p>
        </section>
        <section className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center">
          <div aria-hidden className="size-9 rounded-lg bg-muted" />
          <p className="font-semibold text-[12.5px]">No activity yet</p>
          <p className="max-w-56 text-muted-foreground text-[11.5px]">
            Net worth, spending, and upcoming bills appear as soon as data flows
            in.
          </p>
        </section>
      </div>
    </div>
  )
}
