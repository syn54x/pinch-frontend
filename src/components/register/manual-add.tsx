import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  countUnreviewedTransactionsQueryKey,
  createAccountMutation,
  createTransactionMutation,
  ledgerStatsQueryKey,
  listAccountsOptions,
  listAccountsQueryKey,
  listCategoriesOptions,
  listTransactionsQueryKey,
  meOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import type { AccountKind } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  type Direction,
  parseAmountToMinor,
  signedMinor,
  todayIso,
} from './manual-add-model'

// F10 CP5 (#91, wireframe s10/2b): + Add on the Register — manual
// transaction entry. Account (manual accounts only — the endpoint 409s on
// connected ones), date, payee, amount with an Expense/Income selector
// (the sign; the endpoint has no type field — and no Transfer: cut per the
// PRD, the add-two-then-press-T path remains), optional category. With a
// category the transaction is reviewed at birth; without one it lands in
// review with Penny's proposed category waiting.

export function ManualAdd() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        className="h-7 shrink-0 rounded-full px-3"
        onClick={() => setOpen(true)}
      >
        + Add
      </Button>
      {/* Mount-per-open so every add starts from a fresh form. */}
      {open && <ManualAddDialog onOpenChange={setOpen} />}
    </>
  )
}

const KIND_LABELS: Record<AccountKind, string> = {
  depository: 'Checking / savings',
  credit: 'Credit card',
  investment: 'Investment',
  loan: 'Loan',
  asset: 'Asset (property, valuables)',
}

function ManualAddDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  // Same options as the filter bar — one cached vocabulary.
  const accounts = useQuery(listAccountsOptions({ query: { limit: 100 } }))
  const categories = useQuery(listCategoriesOptions({ query: { limit: 100 } }))

  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<Direction>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accountFieldId = useId()
  const dateFieldId = useId()
  const payeeFieldId = useId()
  const amountFieldId = useId()
  const categoryFieldId = useId()

  // Manual entry is for manual accounts — connected ones never appear.
  const manualAccounts = (accounts.data?.items ?? []).filter(
    (account) => account.manual && !account.archived,
  )
  const selectedAccount =
    manualAccounts.find((account) => account.id === accountId) ??
    manualAccounts[0]

  const create = useMutation({
    ...createTransactionMutation(),
    onSuccess: () => {
      // The new row, the review count, and the onboarding stats all moved.
      queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
      queryClient.invalidateQueries({
        queryKey: countUnreviewedTransactionsQueryKey(),
      })
      queryClient.invalidateQueries({ queryKey: ledgerStatsQueryKey() })
      onOpenChange(false)
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  const amountMinor = selectedAccount
    ? parseAmountToMinor(amount, selectedAccount.currency)
    : null
  const submittable =
    selectedAccount !== undefined &&
    date !== '' &&
    payee.trim() !== '' &&
    amountMinor !== null &&
    !create.isPending

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!selectedAccount || amountMinor === null) return
    setError(null)
    create.mutate({
      body: {
        account_id: selectedAccount.id,
        date,
        amount_minor: signedMinor(amountMinor, direction),
        description: payee.trim(),
        category_id: categoryId || null,
      },
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New transaction</DialogTitle>
        <DialogDescription>
          Your own record — cash spending and off-bank activity, straight into
          the ledger.
        </DialogDescription>
        {accounts.isPending ? null : manualAccounts.length === 0 ? (
          <InlineAccountCreate
            onCreated={(id) => setAccountId(id)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <div className="flex gap-3">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={accountFieldId}>Account</Label>
                <select
                  id={accountFieldId}
                  value={selectedAccount?.id ?? ''}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                >
                  {manualAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid w-[140px] gap-1.5">
                <Label htmlFor={dateFieldId}>Date</Label>
                <Input
                  id={dateFieldId}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={payeeFieldId}>Payee</Label>
              <Input
                id={payeeFieldId}
                value={payee}
                onChange={(event) => setPayee(event.target.value)}
                placeholder="Farmers market"
                required
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="grid w-[140px] gap-1.5">
                <Label htmlFor={amountFieldId}>Amount</Label>
                <Input
                  id={amountFieldId}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="24.00"
                  className="amount"
                  required
                />
              </div>
              {/* Expense or Income — the sign of the amount. No Transfer:
                  cut per the PRD (add both sides, then press T). */}
              <SegmentedControl
                aria-label="Direction"
                className="mb-0.5"
                value={direction}
                options={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                ]}
                onChange={setDirection}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={categoryFieldId}>Category</Label>
              <select
                id={categoryFieldId}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">No category — Penny proposes one</option>
                {(categories.data?.items ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji ? `${category.emoji} ` : ''}
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {categoryId
                  ? 'Skips review — you typed it, it’s already true.'
                  : 'Lands in review with Penny’s proposed category waiting.'}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!submittable}>
                Add transaction
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// The empty picker is never a dead end (#91): with no manual accounts yet,
// the form offers creating one inline — then the transaction form appears
// with it selected.
function InlineAccountCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (accountId: string) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const me = useQuery(meOptions())
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<AccountKind>('depository')
  const labelFieldId = useId()
  const kindFieldId = useId()

  const create = useMutation({
    ...createAccountMutation(),
    onSuccess: async (account) => {
      await queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      onCreated(account.id)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate({
          body: {
            kind,
            label: label.trim(),
            currency: me.data?.primary_currency ?? 'USD',
          },
        })
      }}
    >
      <p className="text-muted-foreground text-sm">
        Manual entry needs a manual account — one you keep yourself, no bank
        attached. Create your first to start.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={labelFieldId}>Account name</Label>
        <Input
          id={labelFieldId}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Cash Wallet"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={kindFieldId}>Kind</Label>
        <select
          id={kindFieldId}
          value={kind}
          onChange={(event) => setKind(event.target.value as AccountKind)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {(Object.keys(KIND_LABELS) as AccountKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {create.isError && (
        <p role="alert" className="text-destructive text-sm">
          {errorDetail(create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={label.trim() === '' || create.isPending}
        >
          Create account
        </Button>
      </div>
    </form>
  )
}
