import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'

// Tag corrections stage locally and ride the same one-shot review call as
// the category (#18). Free entry with existing tag names as suggestions —
// the backend implicit-creates new names on review.

export function TagEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const datalistId = useId()

  function add(name: string) {
    const trimmed = name.trim()
    if (trimmed === '') return
    if (!tags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...tags, trimmed])
    }
    setDraft('')
  }

  return (
    <div
      data-testid="tag-editor"
      className="flex flex-wrap items-center gap-1.5"
    >
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-px text-[11.5px] text-muted-foreground hover:text-foreground"
          onClick={() => onChange(tags.filter((t) => t !== tag))}
          aria-label={`Remove tag ${tag}`}
        >
          {tag}
          <X aria-hidden className="size-3" />
        </button>
      ))}
      <Input
        list={datalistId}
        value={draft}
        placeholder="Add tag"
        aria-label="Add tag"
        className="h-6 w-24 rounded-full px-2 text-[11.5px]"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add(draft)
          } else if (event.key === 'Escape') {
            // Swallow so the route's panel handling doesn't also react.
            event.stopPropagation()
            setDraft('')
          }
        }}
        onBlur={() => add(draft)}
      />
      <datalist id={datalistId}>
        {suggestions
          .filter((name) => !tags.includes(name))
          .map((name) => (
            <option key={name} value={name} />
          ))}
      </datalist>
    </div>
  )
}
