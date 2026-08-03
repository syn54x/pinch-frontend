import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  deleteCategoryMutation,
  listCategoriesQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import type { CategoryOut } from '@/api/generated/types.gen'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

// F4 CP1 (#59): the guarded delete. The API refuses to silently
// uncategorize history — a disposition is required (move transactions to
// another category, or deliberately uncategorize them) — and refuses
// outright while children or rules depend on the node (409s surfaced as
// copy, never a dead button).
export function DeleteCategoryDialog({
  category,
  candidates,
  onOpenChange,
}: {
  category: CategoryOut | null
  /** Reassignment targets — every other category. */
  candidates: CategoryOut[]
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [reassignTo, setReassignTo] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({
    ...deleteCategoryMutation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listCategoriesQueryKey() })
      onOpenChange(false)
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  if (category === null) return null
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Delete {category.name}</DialogTitle>
        <DialogDescription>
          Its transactions need somewhere to go — pick a category, or leave them
          uncategorized.
        </DialogDescription>
        <label className="grid gap-1.5 text-sm">
          Move transactions to
          <select
            value={reassignTo}
            onChange={(event) => setReassignTo(event.target.value)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">Leave uncategorized</option>
            {candidates
              .filter((candidate) => candidate.id !== category.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </select>
        </label>
        {error && (
          <p
            className="text-destructive text-sm"
            data-testid="delete-category-error"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              setError(null)
              remove.mutate({
                path: { category_id: category.id },
                body: { reassign_to: reassignTo || null },
              })
            }}
          >
            Delete category
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
