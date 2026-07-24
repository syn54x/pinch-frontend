import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  dismissRecurringMutation,
  listRecurringQueryKey,
  recurringReportQueryKey,
  updateRecurringMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { RecurringSeriesOut } from '@/api/generated/types.gen'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatMinorUnits } from '@/lib/money'
import { cadenceLabel, cycleStatusText } from '@/lib/recurring'
import { cn } from '@/lib/utils'

// The "Recurring series" curation drawer (s12b/s12c). What the user can shape is
// narrow and honest: rename, and (for a bill/subscription, never income) flip
// the kind. Everything else is detected from history and shown read-only.
// Dismiss is one-way — the confirm copy says so plainly.
export function CurationDrawer({
  series,
  onClose,
}: {
  series: RecurringSeriesOut | null
  onClose: () => void
}) {
  return (
    <Sheet
      open={series !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {series !== null && (
        <CurationBody key={series.id} series={series} onClose={onClose} />
      )}
    </Sheet>
  )
}

function CurationBody({
  series,
  onClose,
}: {
  series: RecurringSeriesOut
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(series.display_name)
  const income = series.direction > 0
  const currency = 'USD'

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: recurringReportQueryKey() })
    queryClient.invalidateQueries({ queryKey: listRecurringQueryKey() })
  }

  const update = useMutation({
    ...updateRecurringMutation(),
    onSuccess: invalidate,
  })
  const dismiss = useMutation({
    ...dismissRecurringMutation(),
    onSuccess: () => {
      invalidate()
      onClose()
    },
  })
  const busy = update.isPending || dismiss.isPending

  const renameDirty = name.trim().length > 0 && name !== series.display_name

  return (
    <SheetContent
      className="gap-5 sm:max-w-[392px]"
      data-testid="curation-drawer"
    >
      <SheetHeader>
        <span className="label-caps">Recurring series</span>
        <SheetTitle>{series.display_name}</SheetTitle>
        <SheetDescription className="amount text-base text-foreground">
          {formatMinorUnits(series.state.est_amount_minor ?? 0, currency)}
          <span className="ml-1 text-muted-foreground text-xs">/ mo</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-1.5">
        <span className="label-caps">Display name</span>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Display name"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!renameDirty || busy}
            onClick={() =>
              update.mutate({
                path: { series_id: series.id },
                body: { display_name: name.trim() },
              })
            }
          >
            Rename
          </Button>
        </div>
      </div>

      {income ? (
        <p className="text-[11.5px] text-muted-foreground">
          Income is set by the sign — only bills &amp; subscriptions can switch.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Type</span>
          <fieldset className="flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(['bill', 'subscription'] as const).map((k) => {
              const active = series.kind === k
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() =>
                    !active &&
                    update.mutate({
                      path: { series_id: series.id },
                      body: { kind: k },
                    })
                  }
                  className={cn(
                    'rounded-md px-3 py-1 font-medium text-xs capitalize transition-colors',
                    active
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k}
                </button>
              )
            })}
          </fieldset>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="label-caps">Detected from history</span>
        <dl className="rounded-xl bg-muted/40 p-3 text-[13px]">
          <Fact term="Cadence" value={cadenceLabel(series.cadence)} />
          <Fact
            term="Amount"
            value={`${formatMinorUnits(series.state.est_amount_minor ?? 0, currency)} · ${series.state.fixed ? 'fixed' : 'varies'}`}
          />
          <Fact term="Category" value={series.bucket ?? 'Uncategorized'} />
        </dl>
        <p className="text-[11.5px] text-muted-foreground">
          Cadence, amount &amp; category come from your transactions — not
          editable here.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="label-caps">This cycle</span>
        <span className="text-[13px]">{cycleStatusText(series, currency)}</span>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="self-start text-destructive text-sm hover:underline disabled:opacity-50"
            >
              Dismiss — stop tracking
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Stop tracking {series.display_name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This series won't be suggested again. Your past{' '}
                {series.display_name} transactions and their categories stay
                untouched — only the recurring tracking stops.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  dismiss.mutate({ path: { series_id: series.id } })
                }
              >
                Dismiss
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <SheetFooter>
          <Button onClick={onClose}>Done</Button>
        </SheetFooter>
      </div>
    </SheetContent>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
