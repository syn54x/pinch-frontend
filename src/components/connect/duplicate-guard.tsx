import type { ConnectionProvider } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DuplicateMatch } from '@/lib/connections'
import { PROVIDER_COPY } from '@/lib/providers'
import { relativeTime } from '@/lib/time'

// The duplicate guard (wireframe 7e, F8 CP2): a soft confirm, not a gate
// — it fires AFTER the widget completes, because institution identity is
// only knowable on the way back (Plaid's Link metadata pre-exchange;
// MX's completed connection post-completion). Keep-existing is the
// primary: it quietly abandons what the walk just created (the caller
// owns the per-provider cleanup — never exchanging the Plaid token,
// deleting the just-created MX connection). Every dismissal (Escape, ✕,
// overlay) is the safe default: keep.

export function DuplicateGuardDialog({
  match,
  attemptProvider,
  onKeep,
  onAdd,
}: {
  /** The existing connection the new walk duplicates. */
  match: DuplicateMatch
  /** The provider the user just walked — names what keep discards. */
  attemptProvider: ConnectionProvider
  onKeep: () => void
  onAdd: () => void
}) {
  const existing = match.connection
  const attemptLabel = PROVIDER_COPY[attemptProvider].label
  const count = existing.accounts.length

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onKeep()
      }}
    >
      <DialogContent data-testid="duplicate-guard">
        <div className="grid gap-1.5">
          <DialogTitle>
            You just connected a bank that’s already here
          </DialogTitle>
          <DialogDescription>
            Keeping the existing one discards what you just set up at{' '}
            {attemptLabel} — nothing is imported and no accounts are added.
            Adding it anyway means the same transactions arrive twice, on two
            sets of accounts.
          </DialogDescription>
        </div>
        <div
          data-testid="duplicate-existing"
          className="rounded-lg border p-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {existing.institution_name ?? 'Connected bank'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase">
              {PROVIDER_COPY[existing.provider].label}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {existing.last_synced_at
              ? `Synced ${relativeTime(existing.last_synced_at)}`
              : 'Never synced'}
            {' · '}
            {count} {count === 1 ? 'account' : 'accounts'}
          </p>
        </div>
        {match.matchedBy === 'name' && (
          // Name-matching honesty (7e): the cross-provider heuristic is
          // soft, and the copy says so out loud.
          <p className="text-muted-foreground text-xs">
            We matched on the institution name, so we can miss — “Chase” and
            “Chase Bank” read as different banks to us.
          </p>
        )}
        <div className="grid gap-2">
          <Button onClick={onKeep}>Keep the existing connection</Button>
          <Button variant="outline" onClick={onAdd}>
            Add it anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
