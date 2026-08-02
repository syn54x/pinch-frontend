// The jest-dom matcher augmentation must enter this compilation unit
// itself — vitest.setup.ts lives outside tsconfig.app's program.
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { asToolPart, type ToolPart } from '@/lib/penny'
import conversationRaw from '../../../e2e/fixtures/penny/conversation-ui-messages.json?raw'
import { Markdown } from './markdown'
import { ToolChip } from './tool-chip'

// Pure-rendering coverage (F6 CP1). The tool parts come from the real
// stored Conversation captured off the wire in CP0 — not hand-invented
// shapes — so these tests break when the wire does.

const conversation = JSON.parse(conversationRaw) as {
  messages: Array<{ role: string; parts: Array<{ type: string }> }>
}
const toolParts = conversation.messages
  .flatMap((message) => message.parts)
  .map(asToolPart)
  .filter((part): part is ToolPart => part !== null)

describe('Markdown', () => {
  it('renders structure, not raw HTML', () => {
    render(
      <Markdown>
        {'**bold** and a list:\n\n- one\n- two\n\n<script>alert(1)</script>'}
      </Markdown>,
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // Raw HTML never executes or lands in the DOM as markup.
    expect(document.querySelector('script')).toBeNull()
  })
})

describe('ToolChip', () => {
  const settled = toolParts.find((part) => part.state === 'output-available')

  it('collapses a real captured tool call to its label, expands to the raw call', () => {
    expect(settled).toBeDefined()
    render(<ToolChip part={settled as ToolPart} />)
    const chip = screen.getByRole('button')
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('tool-raw')).not.toBeInTheDocument()

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('tool-raw')).toHaveTextContent(
      (settled as ToolPart).toolName,
    )
  })

  it('renders consent controls only for approval-requested parts', () => {
    const onApproval = vi.fn()
    const requested: ToolPart = {
      toolName: 'create_category',
      toolCallId: 'call-1',
      state: 'approval-requested',
      input: { name: 'Coffee' },
      approval: { id: 'call-1' },
    }
    render(<ToolChip part={requested} onApproval={onApproval} />)
    expect(screen.getByTestId('approval-requested')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('deny-create_category'))
    expect(onApproval).toHaveBeenCalledWith({ id: 'call-1', approved: false })
  })

  it('renders a resolved approval as history, never re-actionable', () => {
    const denied = toolParts.find((part) => part.state === 'output-denied')
    expect(denied).toBeDefined()
    render(<ToolChip part={denied as ToolPart} onApproval={vi.fn()} />)
    expect(screen.queryByTestId('approval-requested')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAccessibleName(/not applied/)
  })

  it('renders an expired approval as muted history, not the consent card, even with a live approval id', () => {
    const onApproval = vi.fn()
    const stale: ToolPart = {
      toolName: 'create_category',
      toolCallId: 'call-2',
      state: 'approval-requested',
      input: { name: 'Coffee' },
      approval: { id: 'call-2' },
    }
    render(<ToolChip part={stale} onApproval={onApproval} expired />)
    expect(screen.getByTestId('approval-expired')).toBeInTheDocument()
    expect(screen.queryByTestId('approval-requested')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('approve-create_category'),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('deny-create_category')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAccessibleName(
      /expired — not applied/,
    )
  })
})
