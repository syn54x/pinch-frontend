import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type ToolPart, toolDetail, toolLabel, toolStatus } from '@/lib/penny'

// The Tool chip (CONTEXT.md): the collapsed in-conversation trace of one
// Penny tool call — honesty UI, every read visible, expandable to the raw
// call for the curious. Approval-requested writes additionally carry the
// consent controls (functional here; CP4 dresses them as the Approval card).
export function ToolChip({
  part,
  onApproval,
}: {
  part: ToolPart
  onApproval?: (response: { id: string; approved: boolean }) => void
}) {
  const [open, setOpen] = useState(false)
  const label = toolLabel(part)
  const detail = toolDetail(part)
  const status = toolStatus(part)
  const approval = part.approval

  return (
    <div
      data-testid="tool-part"
      data-tool={part.toolName}
      data-state={part.state}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Penny tool call: ${label}${detail ? ` (${detail})` : ''}${status ? `, ${status}` : ''}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-[3px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current opacity-60"
        />
        <span className="truncate">
          {label}
          {detail ? <span className="opacity-70"> · {detail}</span> : null}
          {status ? (
            <span className="italic opacity-70"> · {status}</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <pre
          data-testid="tool-raw"
          className="mt-1.5 max-h-64 max-w-xl overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-[10.5px] leading-snug"
        >
          {JSON.stringify(
            {
              tool: part.toolName,
              input: part.input ?? null,
              output: part.output ?? null,
              ...(part.errorText ? { error: part.errorText } : {}),
            },
            null,
            2,
          )}
        </pre>
      ) : null}
      {part.state === 'approval-requested' && approval && onApproval ? (
        <div
          data-testid="approval-requested"
          className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-penny/40 px-2.5 py-2"
        >
          <span className="text-[12.5px]">
            Penny wants to: {label.toLowerCase()}
            {detail ? ` · ${detail}` : ''}
          </span>
          <span className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              data-testid={`approve-${part.toolName}`}
              onClick={() => onApproval({ id: approval.id, approved: true })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid={`deny-${part.toolName}`}
              onClick={() => onApproval({ id: approval.id, approved: false })}
            >
              Deny
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  )
}
