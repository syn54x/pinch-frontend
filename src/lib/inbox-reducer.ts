// The Inbox's selection/keyboard model as pure state (F3 CP2, wireframe #7):
// row focus, day-grouped traversal, and the open correction panel. The DOM
// layer only dispatches and renders — every transition is testable here
// without a browser.
//
// Rows arrive in the server's visual order (newest-first; day groups derive
// from `date`), and traversal is flat: J/K walk rows straight across group
// boundaries. CP3 widened `InboxPanel` with the deep verbs (S split,
// T transfer) — exactly the seam CP2 left; no other shape changed.

export interface InboxRow {
  id: string
  /** ISO date (YYYY-MM-DD) — the day-group key. */
  date: string
}

/** Which correction affordance is open in the Inspector: the category
 * picker (C), the split editor (S), or the transfer consent (T). */
export type InboxPanel = 'category' | 'split' | 'transfer'

export interface InboxState {
  rows: InboxRow[]
  /** The focused row id — a virtual focus the DOM mirrors (the listbox's
   * aria-activedescendant), never a second source of truth. */
  focusId: string | null
  panel: InboxPanel | null
}

export type InboxAction =
  /** Server truth changed (initial load, refetch, a reviewed row leaving). */
  | { type: 'sync'; rows: InboxRow[] }
  /** Pointer focus. */
  | { type: 'focus'; id: string }
  /** J — next row, straight across day-group boundaries. */
  | { type: 'focusNext' }
  /** K — previous row. */
  | { type: 'focusPrev' }
  /** Reviews landed: rows leave immediately (progress is felt before the
   * refetch), and a removed focus advances to its nearest survivor. */
  | { type: 'remove'; ids: string[] }
  /** C / S / T — open a correction panel on the focused row. */
  | { type: 'openPanel'; panel: InboxPanel }
  | { type: 'closePanel' }

export const initialInboxState: InboxState = {
  rows: [],
  focusId: null,
  panel: null,
}

/** Where focus lands when its row leaves: the nearest survivor at-or-after
 * the old position (accept advances downward), else the nearest above,
 * else nothing. With no prior focus, the first row takes it. */
function resolveFocus(
  oldRows: InboxRow[],
  nextRows: InboxRow[],
  focusId: string | null,
): string | null {
  if (nextRows.length === 0) return null
  if (focusId === null) return nextRows[0].id
  const surviving = new Set(nextRows.map((row) => row.id))
  if (surviving.has(focusId)) return focusId
  const index = oldRows.findIndex((row) => row.id === focusId)
  if (index === -1) return nextRows[0].id
  for (let i = index + 1; i < oldRows.length; i++) {
    if (surviving.has(oldRows[i].id)) return oldRows[i].id
  }
  for (let i = index - 1; i >= 0; i--) {
    if (surviving.has(oldRows[i].id)) return oldRows[i].id
  }
  return nextRows[0].id
}

/** A focus move (or loss) closes any open panel — a correction targets one
 * row; it never silently retargets another. */
function withRows(state: InboxState, nextRows: InboxRow[]): InboxState {
  const focusId = resolveFocus(state.rows, nextRows, state.focusId)
  return {
    rows: nextRows,
    focusId,
    panel: focusId === state.focusId ? state.panel : null,
  }
}

export function inboxReducer(
  state: InboxState,
  action: InboxAction,
): InboxState {
  switch (action.type) {
    case 'sync':
      return withRows(state, action.rows)
    case 'remove': {
      const gone = new Set(action.ids)
      return withRows(
        state,
        state.rows.filter((row) => !gone.has(row.id)),
      )
    }
    case 'focus': {
      if (!state.rows.some((row) => row.id === action.id)) return state
      if (action.id === state.focusId) return state
      return { ...state, focusId: action.id, panel: null }
    }
    case 'focusNext':
    case 'focusPrev': {
      if (state.focusId === null) return state
      const index = state.rows.findIndex((row) => row.id === state.focusId)
      const next = action.type === 'focusNext' ? index + 1 : index - 1
      // Clamped, not wrapped: J at the last row (and K at the first) stays.
      if (index === -1 || next < 0 || next >= state.rows.length) return state
      return { ...state, focusId: state.rows[next].id, panel: null }
    }
    case 'openPanel':
      if (state.focusId === null) return state
      return { ...state, panel: action.panel }
    case 'closePanel':
      if (state.panel === null) return state
      return { ...state, panel: null }
  }
}

/** Day groups in row order — the view's grouping and the reducer's flat
 * traversal read the same array, so they can never disagree. */
export function dayGroups<R extends { date: string }>(
  rows: R[],
): Array<{ date: string; rows: R[] }> {
  const groups: Array<{ date: string; rows: R[] }> = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.date === row.date) last.rows.push(row)
    else groups.push({ date: row.date, rows: [row] })
  }
  return groups
}
