import { describe, expect, it } from 'vitest'
import {
  dayGroups,
  initialQueueState,
  type QueueAction,
  type QueueState,
  queueReducer,
} from './queue-reducer'

// Two day groups, newest-first — the server's visual order.
const ROWS = [
  { id: 'a', date: '2026-07-21' },
  { id: 'b', date: '2026-07-21' },
  { id: 'c', date: '2026-07-20' },
  { id: 'd', date: '2026-07-20' },
]

function loaded(): QueueState {
  return queueReducer(initialQueueState, { type: 'sync', rows: ROWS })
}

function run(state: QueueState, ...actions: QueueAction[]): QueueState {
  return actions.reduce(queueReducer, state)
}

describe('sync', () => {
  it('focuses the first row when nothing was focused', () => {
    const state = loaded()
    expect(state.focusId).toBe('a')
    expect(state.rows).toHaveLength(4)
  })

  it('keeps focus on a surviving row', () => {
    const state = run(loaded(), { type: 'focus', id: 'c' })
    const synced = queueReducer(state, { type: 'sync', rows: ROWS })
    expect(synced.focusId).toBe('c')
  })

  it('mid-list removal: a reviewed row leaving the list hands focus to the next survivor', () => {
    const state = run(loaded(), { type: 'focus', id: 'b' })
    const synced = queueReducer(state, {
      type: 'sync',
      rows: ROWS.filter((row) => row.id !== 'b'),
    })
    expect(synced.focusId).toBe('c')
    expect(synced.rows.map((row) => row.id)).toEqual(['a', 'c', 'd'])
  })
})

describe('traversal', () => {
  it('J walks straight across the day-group boundary', () => {
    const state = run(
      loaded(),
      { type: 'focus', id: 'b' }, // last row of the first day
      { type: 'focusNext' },
    )
    expect(state.focusId).toBe('c') // first row of the next day
  })

  it('K walks back across the boundary', () => {
    const state = run(
      loaded(),
      { type: 'focus', id: 'c' },
      { type: 'focusPrev' },
    )
    expect(state.focusId).toBe('b')
  })

  it('clamps at the edges — no wrap', () => {
    const atFirst = run(loaded(), { type: 'focusPrev' })
    expect(atFirst.focusId).toBe('a')
    const atLast = run(
      loaded(),
      { type: 'focus', id: 'd' },
      { type: 'focusNext' },
    )
    expect(atLast.focusId).toBe('d')
  })
})

describe('empty inbox', () => {
  it('is inert: traversal and removal are all no-ops', () => {
    expect(queueReducer(initialQueueState, { type: 'focusNext' })).toEqual(
      initialQueueState,
    )
    expect(queueReducer(initialQueueState, { type: 'focusPrev' })).toEqual(
      initialQueueState,
    )
    expect(
      queueReducer(initialQueueState, { type: 'remove', ids: ['a'] }),
    ).toEqual(initialQueueState)
  })

  it('removing the last remaining rows lands on no focus', () => {
    const state = run(loaded(), {
      type: 'remove',
      ids: ['a', 'b', 'c', 'd'],
    })
    expect(state.rows).toEqual([])
    expect(state.focusId).toBeNull()
  })
})

describe('accept advances focus', () => {
  it('removing the focused row moves focus to the row after it', () => {
    const state = run(loaded(), { type: 'remove', ids: ['a'] })
    expect(state.focusId).toBe('b')
  })

  it('advances across the group boundary', () => {
    const state = run(
      loaded(),
      { type: 'focus', id: 'b' },
      { type: 'remove', ids: ['b'] },
    )
    expect(state.focusId).toBe('c')
  })

  it('last row: focus falls back to the previous row', () => {
    const state = run(
      loaded(),
      { type: 'focus', id: 'd' },
      { type: 'remove', ids: ['d'] },
    )
    expect(state.focusId).toBe('c')
  })

  it('removing a non-focused row leaves focus alone', () => {
    const state = run(
      loaded(),
      { type: 'focus', id: 'c' },
      { type: 'remove', ids: ['a'] },
    )
    expect(state.focusId).toBe('c')
    expect(state.rows.map((row) => row.id)).toEqual(['b', 'c', 'd'])
  })

  it('a batch removal (accept day) advances past the whole batch', () => {
    const state = run(loaded(), { type: 'remove', ids: ['a', 'b'] })
    expect(state.focusId).toBe('c')
  })
})

describe('dayGroups', () => {
  it('groups adjacent rows by date, preserving order', () => {
    expect(dayGroups(ROWS)).toEqual([
      { date: '2026-07-21', rows: [ROWS[0], ROWS[1]] },
      { date: '2026-07-20', rows: [ROWS[2], ROWS[3]] },
    ])
  })

  it('is empty for an empty inbox', () => {
    expect(dayGroups([])).toEqual([])
  })
})
