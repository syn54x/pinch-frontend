import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorDetail } from '@/api/client'
import {
  createCategoryMutation,
  listCategoriesQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import type {
  CategoryColor,
  CategoryOut,
  CategoryRef,
} from '@/api/generated/types.gen'
import { categoryColorSlot, categoryEmoji } from '@/components/register/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CATEGORY_COLOR_SLOTS, categoryColorVar } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

// #63 (wireframe s7c 2c): the inline sheet the picker's create row opens —
// creating never leaves the Inbox. Four fields, all pre-filled or optional:
// the name is what they typed, icon & color are guessed (the same
// derivation the unset-identity pill uses, so the guess matches what
// they'd see anyway), a picked parent's color outranks the guess (the
// family-color rule), and everything stays editable.
export function CreateCategorySheet({
  initialName,
  parents,
  onCreated,
  onBack,
}: {
  initialName: string
  /** Top-level categories eligible as a parent. */
  parents: CategoryOut[]
  /** Create succeeded — the caller stages the assignment. */
  onCreated: (category: CategoryRef) => void
  /** ‹ back to list — return to the picker, nothing created. */
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState(categoryEmoji(initialName))
  const [color, setColor] = useState<CategoryColor | null>(
    categoryColorSlot(initialName),
  )
  const [colorPicked, setColorPicked] = useState(false)
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const iconId = useId()

  const create = useMutation({
    ...createCategoryMutation(),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: listCategoriesQueryKey() })
      onCreated({ id: created.id, name: created.name })
    },
    onError: (mutationError) => setError(errorDetail(mutationError)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    create.mutate({
      body: {
        name: name.trim(),
        parent_id: parentId || null,
        emoji: emoji.trim() || null,
        color,
      },
    })
  }

  return (
    <form
      data-testid="create-category-sheet"
      className="mt-2 rounded-md border p-3"
      onSubmit={submit}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-[12.5px]">New category</span>
        <button
          type="button"
          className="text-[11.5px] text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          ‹ back to list
        </button>
      </div>
      <div className="grid gap-2.5">
        <label
          htmlFor={nameId}
          className="grid gap-1 text-[11.5px] text-muted-foreground"
        >
          Name
          <Input
            id={nameId}
            aria-label="Category name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            className="h-8"
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label
            htmlFor={iconId}
            className="grid gap-1 text-[11.5px] text-muted-foreground"
          >
            Icon
            <Input
              id={iconId}
              aria-label="Category icon"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              maxLength={20}
              className="h-8 text-center"
            />
          </label>
          <label className="grid gap-1 text-[11.5px] text-muted-foreground">
            Lives under
            <select
              aria-label="Parent category"
              value={parentId}
              onChange={(event) => {
                const next = event.target.value
                setParentId(next)
                if (!colorPicked) {
                  const parent = parents.find((row) => row.id === next)
                  setColor(
                    parent?.color ??
                      categoryColorSlot(name.trim() || 'Category'),
                  )
                }
              }}
              className="h-8 rounded-md border bg-transparent px-1.5 text-[12.5px] text-foreground"
            >
              <option value="">None — top level</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="grid gap-1">
          <legend className="text-[11.5px] text-muted-foreground">Color</legend>
          <div className="flex flex-wrap gap-1">
            {CATEGORY_COLOR_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                title={slot}
                aria-label={`Color ${slot}`}
                aria-pressed={color === slot}
                onClick={() => {
                  setColor(slot)
                  setColorPicked(true)
                }}
                className={cn(
                  'size-5 rounded-full border transition-transform hover:scale-110',
                  color === slot &&
                    'ring-2 ring-ring ring-offset-1 ring-offset-background',
                )}
                style={{ backgroundColor: categoryColorVar(slot) }}
              />
            ))}
          </div>
        </fieldset>
        {error && <p className="text-[11.5px] text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={create.isPending}>
            Create & assign · ↩
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={onBack}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}
