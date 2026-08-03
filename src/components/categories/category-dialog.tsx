import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  createCategoryMutation,
  listCategoriesQueryKey,
  updateCategoryMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import type { CategoryColor, CategoryOut } from '@/api/generated/types.gen'
import { CatPill } from '@/components/register/catpill'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CATEGORY_COLOR_SLOTS, categoryColorVar } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

// F4 CP1 (#59, wireframe s18): identity is born with the category — name,
// optional parent (two levels, the API's cap), emoji via the system picker,
// and one of the 16 named swatches. Editing reuses the same form.
export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  parents,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The category being edited, or null for create. */
  editing: CategoryOut | null
  /** Top-level categories eligible as a parent. */
  parents: CategoryOut[]
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [parentId, setParentId] = useState<string>(editing?.parent_id ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '')
  const [color, setColor] = useState<CategoryColor | null>(
    editing?.color ?? null,
  )
  // Children default to the family color (wireframe: identity carries
  // through the tree) — but an explicit swatch pick always wins, and
  // re-picking a parent never clobbers it.
  const [colorPicked, setColorPicked] = useState(editing?.color != null)
  const [error, setError] = useState<string | null>(null)
  const emojiFieldId = useId()
  const parentFieldId = useId()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listCategoriesQueryKey() })
  const create = useMutation({
    ...createCategoryMutation(),
    onSuccess: () => {
      void invalidate()
      onOpenChange(false)
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })
  const update = useMutation({
    ...updateCategoryMutation(),
    onSuccess: () => {
      void invalidate()
      onOpenChange(false)
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const identity = {
      emoji: emoji.trim() || null,
      color,
    }
    if (editing) {
      update.mutate({
        path: { category_id: editing.id },
        body: {
          name: name.trim(),
          ...identity,
          // Re-parenting is deliberate (the API's reparent flag); only send
          // it when the parent actually changed.
          ...((editing.parent_id ?? '') !== parentId
            ? { parent_id: parentId || null, reparent: true }
            : {}),
        },
      })
    } else {
      create.mutate({
        body: { name: name.trim(), parent_id: parentId || null, ...identity },
      })
    }
  }

  const preview = name.trim() || 'Category'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
        <DialogDescription>
          Emoji and color carry through charts, rows & the register.
        </DialogDescription>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Groceries"
              required
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={emojiFieldId}>Emoji</Label>
              <Input
                id={emojiFieldId}
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                placeholder="🛒"
                maxLength={20}
                className="text-center"
              />
              <p className="text-[11px] text-muted-foreground">
                ⌃⌘Space · Win + . opens your emoji picker
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={parentFieldId}>Parent</Label>
              <select
                id={parentFieldId}
                value={parentId}
                onChange={(event) => {
                  const nextParentId = event.target.value
                  setParentId(nextParentId)
                  if (!colorPicked) {
                    const parent = parents.find(
                      (candidate) => candidate.id === nextParentId,
                    )
                    setColor(parent?.color ?? null)
                  }
                }}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">None — top level</option>
                {parents
                  .filter((parent) => parent.id !== editing?.id)
                  .map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="font-medium text-sm">Color</legend>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_COLOR_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  title={slot}
                  aria-label={`Color ${slot}`}
                  aria-pressed={color === slot}
                  onClick={() => {
                    const next = color === slot ? null : slot
                    setColor(next)
                    setColorPicked(next !== null)
                  }}
                  className={cn(
                    'size-6 rounded-full border transition-transform hover:scale-110',
                    color === slot &&
                      'ring-2 ring-ring ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: categoryColorVar(slot) }}
                />
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            Preview
            <CatPill
              category={{ id: editing?.id ?? 'preview', name: preview }}
              identityOverride={{ emoji: emoji.trim() || null, color }}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
