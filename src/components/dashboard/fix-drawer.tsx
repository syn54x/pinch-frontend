import type { RefObject } from 'react'
import type { TransactionOut } from '@/api/generated/types.gen'
import { ReviewerPanel } from '@/components/inbox/reviewer-panel'
import type { useReviewController } from '@/components/inbox/use-review-controller'
import { Sheet, SheetContent } from '@/components/ui/sheet'

// The Dashboard's "Fix" drawer (wireframe s6b): the CP1 reviewer mounted in a
// 392px Sheet over the full unreviewed queue. The host (ToReviewCard) owns the
// queue, focus, and the review controller — this is the drawer chrome plus the
// ReviewerPanel body. Save advances to the next flagged item (the controller's
// onReviewed removes the row and the reducer advances focus); the day pane
// behind the scrim re-derives as focus crosses a day boundary; Esc/✕ closes and
// radix restores focus to the origin row. "1 of 12" renumbers as external
// changes reshape the queue — never an error state.
export function FixDrawer({
  open,
  onClose,
  focused,
  position,
  total,
  reviewer,
  accepting,
  bodyRef,
  originId,
}: {
  open: boolean
  onClose: () => void
  focused: TransactionOut | null
  position: number
  total: number
  reviewer: ReturnType<typeof useReviewController>
  accepting: boolean
  bodyRef: RefObject<HTMLDivElement | null>
  /** The row whose Fix opened the drawer — focus returns there on close. */
  originId: string | null
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        className="gap-0 p-0 sm:max-w-[392px]"
        data-testid="fix-drawer"
        showClose={false}
        onCloseAutoFocus={(event) => {
          // Return focus to the origin row's Fix button (radix's default
          // restore is unreliable for a controlled, trigger-less sheet). If
          // that row was accepted away during the walk, let focus fall to body.
          event.preventDefault()
          if (originId === null) return
          const origin = document.querySelector<HTMLElement>(
            `[data-testid="fix-${originId}"]`,
          )
          origin?.focus()
        }}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3.5">
          <span className="label-caps flex-1">Inspecting</span>
          {total > 0 && (
            <span
              data-testid="fix-drawer-position"
              className="text-[11.5px] text-muted-foreground"
            >
              {position} of {total}
            </span>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            ✕
          </button>
        </div>
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto p-4 outline-none"
        >
          {focused !== null && (
            <ReviewerPanel
              txn={focused}
              correction={reviewer.correction}
              onCorrectionChange={reviewer.setCorrection}
              panel={reviewer.panel}
              onOpenCategory={reviewer.openCategory}
              onCloseCategory={reviewer.closeCategory}
              onAccept={reviewer.accept}
              accepting={accepting}
              categories={reviewer.categories}
              categoriesPending={reviewer.categoriesPending}
              tagSuggestions={reviewer.tagSuggestions}
              splitLines={reviewer.splitLines}
              onSplitLinesChange={reviewer.setSplitLines}
              onOpenSplit={reviewer.openSplit}
              onMergeBack={reviewer.mergeBack}
              onSaveSplit={reviewer.saveSplit}
              onCancelSplit={reviewer.cancelSplit}
              counterpart={reviewer.counterpart}
              counterpartLabel={reviewer.counterpartLabel}
              onConfirmTransfer={reviewer.consentTransfer}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
