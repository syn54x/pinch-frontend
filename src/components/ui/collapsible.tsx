import { Collapsible as CollapsiblePrimitive } from 'radix-ui'
import type * as React from 'react'

// shadcn's thin wrapper (matching popover.tsx/dialog.tsx's convention):
// Root owns open state, Trigger gets aria-expanded/aria-controls for free,
// Content is only in the DOM (and the accessibility tree) while open.

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
