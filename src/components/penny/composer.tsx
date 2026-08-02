import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SUGGESTIONS } from '@/lib/penny'

// The composer (wireframe s22): a 42px input row above a suggestion-chip
// strip that appears only on an empty Conversation. No Attach — the
// backend has no attachment contract (PRD #45 cut).
export function Composer({
  onSend,
  disabled,
  busy,
  showSuggestions,
}: {
  onSend: (text: string) => void
  /** Penny can't take input at all (unavailable / status unknown). */
  disabled: boolean
  /** A turn is in flight — hold submissions, keep typing open. */
  busy: boolean
  showSuggestions: boolean
}) {
  const [draft, setDraft] = useState('')

  return (
    <div className="shrink-0 border-t px-[22px] py-3">
      {showSuggestions && !disabled ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              data-testid="suggestion-chip"
              onClick={() => onSend(suggestion)}
              className="rounded-full border bg-card px-[9px] py-[3px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex h-[42px] items-center gap-2 rounded-md border bg-card pr-1.5 pl-[13px] focus-within:border-ring"
        onSubmit={(event) => {
          event.preventDefault()
          const text = draft.trim()
          if (!text || disabled || busy) return
          setDraft('')
          onSend(text)
        }}
      >
        <input
          aria-label="Ask Penny"
          className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground disabled:opacity-50"
          placeholder="Ask Penny anything about your money…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled}
        />
        <Button
          type="submit"
          size="sm"
          aria-label="Send"
          disabled={disabled || busy || !draft.trim()}
        >
          ↑
        </Button>
      </form>
    </div>
  )
}
