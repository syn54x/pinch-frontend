import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  netWorthReportQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut } from '@/api/generated/types.gen'
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
  totalBalanceMinor,
} from '@/lib/accounts'
import { formatMinorUnits } from '@/lib/money'
import { useHoverReveal } from '@/lib/use-hover-reveal'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authed/accounts')({
  staticData: { title: 'Accounts' },
  component: AccountsPage,
})

// The Accounts surface (wireframe s-Accounts): every account grouped by category
// with a subtotal, over a running total. Debt lives under Accounts now — the
// Liabilities section and each loan row open the Debt view.
//
// Archive (API story 3, surfaced post-F4): "closed is a state, not an exit" —
// archived accounts leave the total, the groups, and every report (the
// backend's own exclusion), but stay listed in a dimmed section below and
// keep their history in the Register. One-way from the app: no unarchive.
function AccountsPage() {
  // Non-401 failures (the interceptor owns those) throw to the _authed error
  // boundary rather than rendering a silent empty page.
  const accounts = useQuery({ ...listAccountsOptions(), throwOnError: true })
  const [archiving, setArchiving] = useState<AccountOut | null>(null)
  const [deleting, setDeleting] = useState<AccountOut | null>(null)

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

  const active = items.filter((account) => !account.archived)
  const archived = items.filter((account) => account.archived)
  const currency = primaryCurrency(active.length > 0 ? active : items)
  const groups = groupAccounts(active)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="label-caps">
            Total across {active.length} accounts
          </div>
          <div className="amount mt-0.5 font-semibold text-3xl">
            {formatMinorUnits(totalBalanceMinor(active), currency)}
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
  const amount = accountBalanceMinor(account)
  const subline = accountSubline(account)
  const { ref, hovered, bind } = useHoverReveal()

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
      {debt && (
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
      ref={ref}
      {...bind}
      className={cn(
        'flex items-center gap-3 border-b p-4 last:border-b-0',
        debt && 'transition-colors hover:bg-muted/40',
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
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}
      {onArchive && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Archive ${account.label}`}
          className={cn(
            // transition-colors overrides the Button base's transition-all
            // (tailwind-merge resolves same-group conflicts by last-wins):
            // opacity must flip instantly, never animate. Safari can hold a
            // stale compositor layer for an animated opacity property on a
            // button with an SVG child, painting it "revealed" long after
            // the state (and every other engine) says it's hidden.
            'shrink-0 opacity-0 transition-colors focus-visible:opacity-100',
            hovered && 'opacity-100',
          )}
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
          className={cn(
            // See the Archive button above: transition-colors overrides
            // the Button base's transition-all so opacity flips instantly.
            'shrink-0 opacity-0 transition-colors focus-visible:opacity-100',
            hovered && 'opacity-100',
          )}
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
