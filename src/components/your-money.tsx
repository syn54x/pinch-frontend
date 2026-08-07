import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import {
  listAccountsOptions,
  netWorthReportOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { formatMinorUnits } from '@/lib/money'
import { deriveSidebarGroups, useCollapsedSidebarGroups } from '@/lib/sidebar'
import { cn } from '@/lib/utils'

// Your money (F10 CP3, PRD #79 stories 16-21, wireframe s24): the sidebar's
// Cash / Investments / Property / Debt groups, reading the net-worth report
// (not the plain accounts list) so group totals are real primary-currency
// sums, consistent with the Accounts page. Balances only — no change
// indicators (explicit wireframe note). Any range gives the same current
// balances (net-worth.ts's report shape); 1m is the cheapest ask, matching
// the Dashboard net-worth card's same reasoning.
export function YourMoney() {
  const accounts = useQuery(listAccountsOptions())
  const report = useQuery(netWorthReportOptions({ query: { range: '1m' } }))
  const { collapsed, toggle } = useCollapsedSidebarGroups()

  if (accounts.data === undefined || report.data === undefined) return null

  const groups = deriveSidebarGroups(accounts.data.items, report.data)
  if (groups.length === 0) return null

  return (
    <div>
      <div className="label-caps mt-3.5 mb-1 px-2">Your money</div>
      {groups.map((group) => {
        const open = !collapsed.has(group.key)
        return (
          <Collapsible
            key={group.key}
            open={open}
            onOpenChange={() => toggle(group.key)}
          >
            <CollapsibleTrigger
              data-testid={`sidebar-group-${group.key}`}
              className="flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-[11.5px] text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2"
            >
              <ChevronRight
                aria-hidden
                className={cn(
                  'size-3 shrink-0 opacity-60 transition-transform',
                  open && 'rotate-90',
                )}
              />
              <span className="label-caps text-[10px]">{group.label}</span>
              <span
                data-testid={`sidebar-group-${group.key}-total`}
                className="amount ml-auto text-[10px] text-foreground/70"
              >
                {formatMinorUnits(group.totalMinor, group.currency)}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent
              role="group"
              aria-label={`${group.label} accounts`}
              className="flex flex-col gap-[3px]"
            >
              {group.accounts.map((account) => {
                const excludedNote = account.excluded
                  ? `No ${report.data.currency} rate for ${account.currency} yet — shown in its own currency, not included in the ${group.label} total.`
                  : undefined
                return (
                  <div
                    key={account.id}
                    data-testid={`sidebar-account-${account.id}`}
                    title={excludedNote}
                    className="flex items-center gap-2 rounded-md px-2 py-[5px] pl-[26px] text-[12px] text-muted-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {account.label}
                    </span>
                    <span className="amount shrink-0 text-[11.5px]">
                      {formatMinorUnits(account.balanceMinor, account.currency)}
                    </span>
                    {/* The `title` above is mouse-only — give screen-reader
                        users the same fact without changing the visible
                        row (keeps existing name/amount text assertions
                        intact). */}
                    {excludedNote && (
                      <span className="sr-only">{excludedNote}</span>
                    )}
                  </div>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
