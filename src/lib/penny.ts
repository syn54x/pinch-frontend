// The Penny conversation model (CONTEXT.md: Penny screen, Tool chip,
// Approval card). Pure: part normalization and the human labels for tool
// traces live here; rendering lives in components/penny.

/** One structural shape for a tool part, whichever wire form it arrived in
 * (`tool-<name>` for declared tools, `dynamic-tool` for undeclared — the
 * stream names tools this client never registers). */
export interface ToolPart {
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string }
}

export function asToolPart(part: { type: string }): ToolPart | null {
  if (part.type === 'dynamic-tool') return part as unknown as ToolPart
  if (part.type.startsWith('tool-')) {
    const raw = part as unknown as Omit<ToolPart, 'toolName'>
    return { ...raw, toolName: part.type.slice('tool-'.length) }
  }
  return null
}

/** Tool chips speak the ledger's language, past tense for reads ("what
 * Penny looked at") and imperative for writes ("what Penny wants to do" —
 * the approval verbs, styled properly in CP4). Unknown tools fall back to
 * their wire name so a new backend tool degrades legibly, never invisibly. */
const TOOL_LABELS: Record<string, string> = {
  list_accounts: 'Listed your accounts',
  search_transactions: 'Searched transactions',
  get_transaction: 'Read a transaction',
  spending_report: 'Read your spending report',
  net_worth_report: 'Read your net worth',
  debt_report: 'Read your debt report',
  list_recurring_series: 'Listed recurring bills',
  list_categories: 'Listed your categories',
  list_rules: 'Listed your rules',
  ledger_stats: 'Read ledger stats',
  recategorize_transaction: 'Recategorize a transaction',
  accept_review: 'Accept a review',
  create_rule: 'Create a rule',
  mark_transfer: 'Mark a transfer',
  create_category: 'Create a category',
}

/** The write bundle (pinch-backend `penny/bundles.py`), mirrored so the
 * frontend can recognize "this call changed the ledger" without a
 * per-tool response map — every name here triggers the same blanket cache
 * invalidation (PRD #45 decision 9). Extending the bundle only means
 * adding a name here; no new invalidation logic. */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'recategorize_transaction',
  'accept_review',
  'create_rule',
  'mark_transfer',
  'create_category',
])

/** The detail a chip shows after its label ("Read your spending report ·
 * 2026-06"): the one input field a human would use to tell two calls apart. */
const DETAIL_KEYS = ['month', 'query', 'name', 'payee_contains', 'range']

export function toolLabel(part: ToolPart): string {
  return TOOL_LABELS[part.toolName] ?? part.toolName.replaceAll('_', ' ')
}

export function toolDetail(part: ToolPart): string | null {
  if (typeof part.input !== 'object' || part.input === null) return null
  const input = part.input as Record<string, unknown>
  for (const key of DETAIL_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

/** The chip's status word — screen-reader text and the muted suffix. */
export function toolStatus(part: ToolPart): string | null {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return 'working…'
    case 'approval-requested':
      return 'needs your approval'
    case 'approval-responded':
      return 'answered'
    case 'output-denied':
      return 'not applied'
    case 'output-error':
      return 'failed'
    default:
      return null
  }
}

/** Empty-conversation suggestion chips: three, static, and honest — each
 * maps to a read tool Penny actually has (PRD #45; the wireframe's "Import
 * a CSV" chip promised a tool that doesn't exist and was cut). */
export const SUGGESTIONS: readonly string[] = [
  'Summarize this month',
  "How's my net worth trending?",
  'Any bills unpaid this cycle?',
]
