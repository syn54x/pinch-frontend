import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorDetail } from '@/api/client'
import { updateAccountLabelMutation } from '@/api/generated/@tanstack/react-query.gen'
import type { AccountOut, AccountPatchIn } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deriveMaturity,
  deriveTermMonths,
  formatMonthInput,
  parseMonthInput,
} from '@/lib/debt'

function minorToInput(minor: number | null): string {
  if (minor === null) return ''
  return String(Math.abs(minor) / 100)
}

function dollarsToMinor(raw: string): number | null {
  const value = raw.trim()
  if (value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

// The shared add/edit terms form (s15c). What's editable is narrow and stored as
// manual: APR + minimum payment (both loan & credit), and — for a loan —
// principal, term, and opened. The backend has no "term" field, so Opened + Term
// fold into maturity_date on save (Decision 2); the terms card derives the term
// back for display. Save is the accounts PATCH (updateAccountLabel carries terms).
export function TermsForm({
  account,
  onDone,
}: {
  account: AccountOut
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const canSetFullTerms = account.kind === 'loan'
  const terms = account.terms

  const [label, setLabel] = useState(account.label)
  const [apr, setApr] = useState(terms?.apr != null ? String(terms.apr) : '')
  const [minPayment, setMinPayment] = useState(
    minorToInput(terms?.minimum_payment_minor ?? null),
  )
  const [principal, setPrincipal] = useState(
    minorToInput(terms?.origination_amount_minor ?? null),
  )
  const [termMonths, setTermMonths] = useState(
    deriveTermMonths(
      terms?.origination_date ?? null,
      terms?.maturity_date ?? null,
    )?.toString() ?? '',
  )
  const [opened, setOpened] = useState(
    formatMonthInput(terms?.origination_date ?? null),
  )
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    ...updateAccountLabelMutation(),
    onSuccess: () => {
      // Terms change the account's payoff, the debt report, and the accounts
      // list — invalidate all three (any what-if variant included).
      queryClient.invalidateQueries({
        predicate: (query) => {
          const id = (query.queryKey[0] as { _id?: string } | undefined)?._id
          return (
            id === 'debtReport' || id === 'getPayoff' || id === 'listAccounts'
          )
        },
      })
      onDone()
    },
  })

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const openedIso = parseMonthInput(opened)
    // A term is stored as its maturity date, which needs the open date — the
    // one cross-field rule (Decision 2).
    if (termMonths.trim() !== '' && openedIso === null) {
      setError('Add the open date (MM/YYYY) to set a term.')
      return
    }

    const body: AccountPatchIn = {
      label: label.trim(),
      apr: apr.trim() === '' ? null : Number(apr),
      minimum_payment_minor: dollarsToMinor(minPayment),
    }
    if (canSetFullTerms) {
      const principalMinor = dollarsToMinor(principal)
      body.origination_amount_minor =
        principalMinor === null ? null : -principalMinor
      body.origination_date = openedIso
      body.maturity_date =
        termMonths.trim() !== '' && openedIso !== null
          ? deriveMaturity(openedIso, Number(termMonths))
          : null
    }
    save.mutate({ path: { account_id: account.id }, body })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="terms-label" label="Lender / nickname">
        <Input
          id="terms-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="terms-apr" label="APR %">
          <Input
            id="terms-apr"
            inputMode="decimal"
            placeholder="e.g. 8.9"
            value={apr}
            onChange={(e) => setApr(e.target.value)}
          />
        </Field>
        <Field id="terms-min" label="Minimum payment ($ / mo)">
          <Input
            id="terms-min"
            inputMode="decimal"
            placeholder="e.g. 150"
            value={minPayment}
            onChange={(e) => setMinPayment(e.target.value)}
          />
        </Field>
      </div>

      {canSetFullTerms && (
        <div className="grid grid-cols-2 gap-3">
          <Field id="terms-principal" label="Original principal ($) · optional">
            <Input
              id="terms-principal"
              inputMode="decimal"
              placeholder="e.g. 52,000"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </Field>
          <Field id="terms-term" label="Term (months) · optional">
            <Input
              id="terms-term"
              inputMode="numeric"
              placeholder="e.g. 60"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
            />
          </Field>
          <Field id="terms-opened" label="Opened (MM/YYYY) · optional">
            <Input
              id="terms-opened"
              placeholder="MM / YYYY"
              value={opened}
              onChange={(e) => setOpened(e.target.value)}
            />
          </Field>
        </div>
      )}

      {(error !== null || save.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? errorDetail(save.error)}
        </p>
      )}

      <p className="text-[11.5px] text-muted-foreground">
        Every field is entered by hand and stored as manual — a future Plaid
        sync fills what it can and tags it, still overridable.
      </p>

      <div className="mt-2 flex gap-2">
        <Button type="submit" className="flex-1" disabled={save.isPending}>
          Save terms
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[11.5px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
