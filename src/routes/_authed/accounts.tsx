import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Archive, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  archiveAccountMutation,
  debtReportQueryKey,
  deleteAccountMutation,
  deletionPreviewOptions,
  listAccountsOptions,
  listAccountsQueryKey,
  listTransactionsQueryKey,
  netWorthReportOptions,
  netWorthReportQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut } from '@/api/generated/types.gen'
import {
  AccountsOverview,
  type AccountsTab,
} from '@/components/accounts/accounts-overview'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  accountBalanceMinor,
  accountSubline,
  groupAccounts,
  isDebtAccount,
  primaryCurrency,
} from '@/lib/accounts'
import { formatMinorUnits } from '@/lib/money'
import type { NetWorthRange } from '@/lib/net-worth'
import { cn } from '@/lib/utils'

type AccountsSearch = { tab?: AccountsTab; range?: NetWorthRange }

export const Route = createFileRoute('/_authed/accounts')({
  staticData: { title: 'Accounts' },
  // Tab and range live in the URL so they survive reload and share as links;
  // a malformed hand-edit degrades to the defaults, never an error. The
  // default tab (Net worth) and range (6m) stay out of the URL.
  validateSearch: (raw: Record<string, unknown>): AccountsSearch => {
    const search: AccountsSearch = {}
    if (raw.tab === 'assets-debts') search.tab = raw.tab
    const range = raw.range
    if (range === '1m' || range === '6m' || range === '1y' || range === 'all')
      search.range = range
    return search
  },
  component: AccountsPage,
})

// The Accounts surface (F10 CP2, wireframes 1l/4f/3b): Accounts absorbs Net
// Worth. The page opens on a Net worth tab — the full chart with range chips,
// an Assets vs debts tab beside it — and the grouped account list beneath,
// every account under its category with a subtotal. Debt still lives under
// Accounts: the Liabilities section and each loan row open the Debt view.
//
// Archive (API story 3, surfaced post-F4): "closed is a state, not an exit" —
// archived accounts leave the chart, the groups, and every report (the
// backend's own exclusion), but stay listed in a dimmed section below and
// keep their history in the Register. One-way from the app: no unarchive.
function AccountsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const tab: AccountsTab = search.tab ?? 'net-worth'
  const range: NetWorthRange = search.range ?? '6m'

  // Non-401 failures (the interceptor owns those) throw to the _authed error
  // boundary rather than rendering a silent empty page.
  const accounts = useQuery({ ...listAccountsOptions(), throwOnError: true })
  const report = useQuery({
    ...netWorthReportOptions({ query: { range } }),
    // Keep the previous range's numbers on screen while the next loads —
    // switching ranges shouldn't flash a skeleton.
    placeholderData: keepPreviousData,
    throwOnError: true,
  })
  const [archiving, setArchiving] = useState<AccountOut | null>(null)
  const [deleting, setDeleting] = useState<AccountOut | null>(null)

  if (accounts.isPending || report.data === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <Skeleton className="h-64 w-full rounded-xl" />
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

  const active = items.filter((account) => !account.archived)
  const archived = items.filter((account) => account.archived)
  const currency = primaryCurrency(active.length > 0 ? active : items)
  const groups = groupAccounts(active)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <AccountsOverview
        data={report.data}
        tab={tab}
        range={range}
        onTabChange={(next) =>
          navigate({
            search: (prev) => ({
              ...prev,
              tab: next === 'net-worth' ? undefined : next,
            }),
          })
        }
        onRangeChange={(next) =>
          navigate({
            search: (prev) => ({ ...prev, range: next }),
            replace: true,
          })
        }
      />

      <div className="flex items-center justify-between gap-3">
        <span className="label-caps">
          {active.length} account{active.length === 1 ? '' : 's'}
        </span>
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
              <AccountRow
                key={account.id}
                account={account}
                onArchive={() => setArchiving(account)}
                onDelete={
                  // Hard delete is for disconnected debris only — a
                  // connected account 409s server-side (the next sync would
                  // re-create it), so the verb never shows there.
                  account.manual ? () => setDeleting(account) : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="archived-section">
          <h2 className="font-medium text-muted-foreground text-sm">
            Archived
            <span className="ml-2 text-xs">{archived.length}</span>
          </h2>
          <div className="overflow-hidden rounded-xl bg-card opacity-60 ring-1 ring-foreground/10">
            {archived.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            archived accounts leave Net Worth &amp; Debt but keep their history
            in the Register
          </p>
        </section>
      )}

      <ArchiveDialog
        account={archiving}
        onOpenChange={() => setArchiving(null)}
      />
      <DeleteAccountDialog
        account={deleting}
        onOpenChange={() => setDeleting(null)}
      />
    </div>
  )
}

function ArchiveDialog({
  account,
  onOpenChange,
}: {
  account: AccountOut | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const archive = useMutation({
    ...archiveAccountMutation(),
    onSuccess: () => {
      // Reports exclude archived server-side — re-ask everything that reads
      // accounts (the F5 ledger-stats lesson: invalidate wide, not narrow).
      void queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      void queryClient.invalidateQueries({ queryKey: netWorthReportQueryKey() })
      void queryClient.invalidateQueries({ queryKey: debtReportQueryKey() })
      onOpenChange(false)
    },
  })
  if (account === null) return null
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Archive {account.label}?</DialogTitle>
        <DialogDescription>
          It leaves Net Worth, Debt, and the accounts total, but its
          transactions stay in the Register and every report of the past. Closed
          is a state, not an exit — but there's no unarchive from the app.
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={archive.isPending}
            onClick={() => archive.mutate({ path: { account_id: account.id } })}
          >
            Archive account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAccountDialog({
  account,
  onOpenChange,
}: {
  account: AccountOut | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const preview = useQuery({
    ...deletionPreviewOptions({ path: { account_id: account?.id ?? '' } }),
    enabled: account !== null,
  })
  const remove = useMutation({
    ...deleteAccountMutation(),
    onSuccess: () => {
      // Deleting transactions moves every ledger surface — invalidate wide.
      void queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      void queryClient.invalidateQueries({
        queryKey: listTransactionsQueryKey(),
      })
      void queryClient.invalidateQueries({ queryKey: netWorthReportQueryKey() })
      void queryClient.invalidateQueries({ queryKey: debtReportQueryKey() })
      onOpenChange(false)
    },
  })
  if (account === null) return null
  const counts = preview.data
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Delete {account.label}?</DialogTitle>
        <DialogDescription data-testid="delete-account-consent">
          {counts
            ? `Permanently deletes ${counts.transactions} transaction${
                counts.transactions === 1 ? '' : 's'
              } (${counts.reviewed} reviewed)` +
              (counts.transfers > 0
                ? `, dissolves ${counts.transfers} transfer${
                    counts.transfers === 1 ? '' : 's'
                  }`
                : '') +
              ` and voids their decisions in Learning. This cannot be undone.`
            : 'Counting what this takes with it…'}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || !counts}
            onClick={() => remove.mutate({ path: { account_id: account.id } })}
          >
            Delete account & data
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AccountRow({
  account,
  onArchive,
  onDelete,
}: {
  account: AccountOut
  onArchive?: () => void
  onDelete?: () => void
}) {
  const debt = isDebtAccount(account)
  const investment = account.kind === 'investment'
  const linksToDetail = debt || investment
  const amount = accountBalanceMinor(account)
  const subline = accountSubline(account)

  const content = (
    <>
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
      {linksToDetail && (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </>
  )

  return (
    <div
      data-testid="account-card"
      className={cn(
        'flex items-center gap-3 border-b p-4 last:border-b-0',
        linksToDetail && 'transition-colors hover:bg-muted/40',
      )}
    >
      {debt ? (
        // Loans & cards deep-link into the Debt view for their payoff
        // timeline; the archive verb stays a sibling, never nested inside
        // the link.
        <Link
          to="/accounts/debt/$accountId"
          params={{ accountId: account.id }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {content}
        </Link>
      ) : investment ? (
        // Brokerages deep-link into the investments view (M10 companion):
        // holdings and activity, raw truth ahead of the portfolio surface.
        <Link
          to="/accounts/investments/$accountId"
          params={{ accountId: account.id }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {content}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}
      {/* The archive/delete rail (F10 CP2, wireframes 1l/4f): always visible,
          no hover discovery — destructive-adjacent verbs aren't hidden. */}
      {onArchive && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Archive ${account.label}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onArchive}
        >
          <Archive className="size-3.5" aria-hidden />
        </Button>
      )}
      {onDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${account.label}`}
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      )}
    </div>
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
