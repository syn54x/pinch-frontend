import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { errorDetail, statusOf } from '@/api/client'
import { createConnection, createLinkToken } from '@/api/generated'
import {
  countUnreviewedTransactionsQueryKey,
  createAccountMutation,
  listAccountsQueryKey,
  listConnectionsOptions,
  listConnectionsQueryKey,
  listTransactionsQueryKey,
  meOptions,
  meQueryKey,
  updateMeMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { AccountKind } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlaidExitError, usePlaidConnect } from '@/lib/plaid'
import { cn } from '@/lib/utils'

// Onboarding (CONTEXT.md, wireframe #5): the inferred first-run wizard —
// an empty ledger (no accounts, no connections) lands here instead of the
// queue. Three cards: primary currency (pre-filled from /me, saved through
// the F3 enabler), connect-or-manual (the F2 Plaid flow, reused verb for
// verb), and honest sync progress (connection status only — no
// classification counts, no recurring counts; that theater returns with
// real numbers in M8). Every step skippable: the wizard never holds the
// user hostage, and a skipped-through run lands on the Inbox empty state.
//
// The trigger is stateless — the ledger's emptiness IS the state — so a
// skip lives only as long as this page load (module scope, not storage):
// an emptied ledger sees the wizard again, exactly as #15 demands.

let skippedThisLoad = false

export function onboardingSkippedThisLoad(): boolean {
  return skippedThisLoad
}

const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'BRL',
  'MXN',
  'SEK',
  'NOK',
  'DKK',
  'NZD',
  'SGD',
  'HKD',
  'ZAR',
]

function currencyLabel(code: string): string {
  const name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(code)
  return name !== undefined && name !== code ? `${code} — ${name}` : code
}

const KIND_LABELS: Record<AccountKind, string> = {
  depository: 'Checking / savings',
  credit: 'Credit card',
  investment: 'Investment',
  loan: 'Loan',
  asset: 'Other asset',
}

type Step = 'currency' | 'connect' | 'manual' | 'progress'

export function OnboardingWizard({
  onEngage,
  onDone,
}: {
  /** The user advanced past step one — keep the wizard mounted even once
   * the ledger stops being empty (a fresh connection un-infers the
   * trigger mid-flow). */
  onEngage: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<Step>('currency')
  const [connectionId, setConnectionId] = useState<string | null>(null)

  function finish() {
    skippedThisLoad = true
    onDone()
  }

  function advance(next: Step) {
    onEngage()
    setStep(next)
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div
        data-testid="onboarding-wizard"
        className="flex min-h-[430px] w-full max-w-sm flex-col rounded-xl border bg-card p-6 shadow-lg"
      >
        <StepStrip
          filled={step === 'currency' ? 1 : step === 'progress' ? 3 : 2}
        />
        {step === 'currency' && (
          <CurrencyStep onContinue={() => advance('connect')} onSkip={finish} />
        )}
        {step === 'connect' && (
          <ConnectStep
            onConnected={(id) => {
              setConnectionId(id)
              advance('progress')
            }}
            onManual={() => advance('manual')}
            onSkip={finish}
          />
        )}
        {step === 'manual' && (
          <ManualStep
            onCreated={finish}
            onBack={() => setStep('connect')}
            onSkip={finish}
          />
        )}
        {step === 'progress' && connectionId !== null && (
          <ProgressStep connectionId={connectionId} onSynced={finish} />
        )}
      </div>
    </div>
  )
}

function StepStrip({ filled }: { filled: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[1, 2, 3].map((segment) => (
        <div
          key={segment}
          className={cn(
            'h-[3px] flex-1 rounded-full',
            segment <= filled ? 'bg-primary' : 'bg-muted',
          )}
        />
      ))}
    </div>
  )
}

function SkipLink({
  onSkip,
  children = 'Skip for now',
}: {
  onSkip: () => void
  children?: string
}) {
  return (
    <button
      type="button"
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={onSkip}
    >
      {children}
    </button>
  )
}

function CurrencyStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void
  onSkip: () => void
}) {
  const queryClient = useQueryClient()
  const me = useQuery(meOptions())
  const selectId = useId()
  // Pre-filled from the user's current primary currency (#15) — staged
  // locally, saved on Continue through the enabler's PATCH.
  const [choice, setChoice] = useState<string | null>(null)
  const current = me.data?.primary_currency ?? 'USD'
  const value = choice ?? current
  const codes = CURRENCIES.includes(current)
    ? CURRENCIES
    : [current, ...CURRENCIES]

  const save = useMutation({
    ...updateMeMutation(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meQueryKey() })
      onContinue()
    },
  })

  return (
    <>
      <div aria-hidden className="mt-6 size-8 rounded-lg bg-primary" />
      <h2 className="mt-4 font-semibold text-lg">Welcome to Pinch</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Let’s set up your ledger. First, the currency your totals report in.
      </p>
      <Label htmlFor={selectId} className="label-caps mt-5">
        Primary currency
      </Label>
      <select
        id={selectId}
        className="mt-1.5 h-10 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-2"
        value={value}
        onChange={(event) => setChoice(event.target.value)}
      >
        {codes.map((code) => (
          <option key={code} value={code}>
            {currencyLabel(code)}
          </option>
        ))}
      </select>
      <p className="mt-2 text-muted-foreground text-xs">
        Foreign transactions are stored as-is and shown at current rates.
      </p>
      {save.isError && (
        <p role="alert" className="mt-2 text-destructive text-sm">
          {errorDetail(save.error)}
        </p>
      )}
      <div className="flex-1" />
      <Button
        className="mt-5 w-full"
        disabled={save.isPending}
        onClick={() => {
          // Nothing changed → nothing to save; the pre-fill is the answer.
          if (value === current) onContinue()
          else save.mutate({ body: { primary_currency: value } })
        }}
      >
        Continue
      </Button>
      <p className="mt-2.5 text-center text-muted-foreground text-xs">
        <SkipLink onSkip={onSkip} />
      </p>
    </>
  )
}

function ConnectStep({
  onConnected,
  onManual,
  onSkip,
}: {
  onConnected: (connectionId: string) => void
  onManual: () => void
  onSkip: () => void
}) {
  const queryClient = useQueryClient()
  const connect = usePlaidConnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The F2 connect flow, verb for verb (routes/connections.tsx): link
  // token → Plaid Link → exchange. A 403 on link-token is the keyless
  // stance, said plainly.
  async function handleConnect() {
    setError(null)
    setBusy(true)
    try {
      let tokenOut: { link_token: string }
      try {
        ;({ data: tokenOut } = await createLinkToken({
          body: null,
          throwOnError: true,
        }))
      } catch (caught) {
        setError(
          statusOf(caught) === 403
            ? `${errorDetail(caught)} — bank connections aren’t enabled on this instance. Add an account manually instead.`
            : errorDetail(caught),
        )
        return
      }
      const publicToken = await connect(tokenOut.link_token)
      if (publicToken === null) return // dismissed — not an error
      const { data: connection } = await createConnection({
        body: { public_token: publicToken },
        throwOnError: true,
      })
      queryClient.invalidateQueries({ queryKey: listConnectionsQueryKey() })
      onConnected(connection.id)
    } catch (caught) {
      setError(
        caught instanceof PlaidExitError ? caught.message : errorDetail(caught),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="mt-6 font-semibold text-lg">Connect your first account</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Link a bank and transactions flow in automatically. Or add one manually.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={handleConnect}
        className="mt-4 flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent focus-visible:outline-2 disabled:opacity-60"
      >
        <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[12.5px]">
            Connect a bank
          </span>
          <span className="block text-muted-foreground text-xs">
            via Plaid · 12,000+ institutions
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-2.5 flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left hover:bg-accent focus-visible:outline-2"
      >
        <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[12.5px]">
            Add manually
          </span>
          <span className="block text-muted-foreground text-xs">
            enter balances yourself
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex-1" />
      <p className="mt-5 text-center text-muted-foreground text-xs">
        You can add more later · <SkipLink onSkip={onSkip} />
      </p>
    </>
  )
}

function ManualStep({
  onCreated,
  onBack,
  onSkip,
}: {
  onCreated: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const queryClient = useQueryClient()
  const me = useQuery(meOptions())
  const labelId = useId()
  const kindId = useId()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<AccountKind>('depository')

  const create = useMutation({
    ...createAccountMutation(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
      onCreated()
    },
  })

  return (
    <>
      <h2 className="mt-6 font-semibold text-lg">Add an account manually</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Name it and pick its kind — balances and history can arrive later via
        imports.
      </p>
      <Label htmlFor={labelId} className="label-caps mt-5">
        Account name
      </Label>
      <Input
        id={labelId}
        className="mt-1.5"
        placeholder="e.g. Everyday Checking"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <Label htmlFor={kindId} className="label-caps mt-4">
        Kind
      </Label>
      <select
        id={kindId}
        className="mt-1.5 h-10 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-2"
        value={kind}
        onChange={(event) => setKind(event.target.value as AccountKind)}
      >
        {(Object.keys(KIND_LABELS) as AccountKind[]).map((value) => (
          <option key={value} value={value}>
            {KIND_LABELS[value]}
          </option>
        ))}
      </select>
      {create.isError && (
        <p role="alert" className="mt-2 text-destructive text-sm">
          {errorDetail(create.error)}
        </p>
      )}
      <div className="flex-1" />
      <Button
        className="mt-5 w-full"
        disabled={label.trim() === '' || create.isPending}
        onClick={() =>
          create.mutate({
            body: {
              kind,
              label: label.trim(),
              currency: me.data?.primary_currency ?? 'USD',
            },
          })
        }
      >
        Create account
      </Button>
      <p className="mt-2.5 flex justify-center gap-3 text-center text-muted-foreground text-xs">
        <SkipLink onSkip={onBack}>Back</SkipLink>
        <SkipLink onSkip={onSkip} />
      </p>
    </>
  )
}

function ProgressStep({
  connectionId,
  onSynced,
}: {
  connectionId: string
  onSynced: () => void
}) {
  const queryClient = useQueryClient()
  const [landed, setLanded] = useState(false)
  // The F2 sync-watch seam: poll the connection while its first sync runs.
  // Progress here is honest — the connection's status and nothing else; no
  // classification counts, no recurring counts (#20 cuts the theater).
  const connections = useQuery({
    ...listConnectionsOptions(),
    refetchInterval: landed ? undefined : 3_000,
  })
  const connection = connections.data?.items.find(
    (candidate) => candidate.id === connectionId,
  )
  const accountCount = connection?.accounts.length ?? 0
  const synced = connection !== undefined && connection.last_synced_at !== null

  // First sync complete: the pipeline has already classified — the queue
  // and count re-ask, and the wizard lands the user in finished work.
  useEffect(() => {
    if (!synced || landed) return
    setLanded(true)
    queryClient.invalidateQueries({ queryKey: listTransactionsQueryKey() })
    queryClient.invalidateQueries({
      queryKey: countUnreviewedTransactionsQueryKey(),
    })
    queryClient.invalidateQueries({ queryKey: listAccountsQueryKey() })
    onSynced()
  }, [synced, landed, queryClient, onSynced])

  const failed = connection !== undefined && connection.status === 'error'

  return (
    <div
      className="flex flex-1 flex-col items-center pt-8 text-center"
      data-testid="onboarding-progress"
    >
      <div
        aria-hidden
        className={cn(
          'size-12 rounded-full bg-penny',
          !failed && 'motion-safe:animate-pulse',
        )}
      />
      <h2 className="mt-4 font-semibold text-lg">
        {failed
          ? 'The first sync hit a snag'
          : `Syncing ${connection?.institution_name ?? 'your bank'}`}
      </h2>
      <p className="mt-1.5 text-muted-foreground text-sm">
        {failed
          ? (connection.error_detail ??
            'The connection reported an error — it can be repaired from Connections.')
          : accountCount > 0
            ? `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'} linked — pulling their history. Your Inbox fills the moment it lands.`
            : 'Linking your accounts and pulling their history. Your Inbox fills the moment it lands.'}
      </p>
      {!failed && (
        <div
          role="status"
          aria-label="First sync in progress"
          className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" />
        </div>
      )}
      <div className="flex-1" />
      <p className="mt-5 text-muted-foreground text-xs">
        <SkipLink onSkip={onSynced}>
          {failed ? 'Continue to Pinch' : 'Skip the wait'}
        </SkipLink>
      </p>
    </div>
  )
}
