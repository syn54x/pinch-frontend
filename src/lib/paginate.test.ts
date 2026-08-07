import { describe, expect, it, vi } from 'vitest'
import { walkPages } from './paginate'

describe('walkPages', () => {
  it('stitches pages in order, chaining each next_cursor until null', async () => {
    const pages: Record<string, { items: string[]; next: string | null }> = {
      first: { items: ['a', 'b'], next: 'c2' },
      c2: { items: ['c'], next: 'c3' },
      c3: { items: ['d'], next: null },
    }
    const seen: Array<string | undefined> = []
    const items = await walkPages<string>(async (cursor) => {
      seen.push(cursor)
      const page = pages[cursor ?? 'first']
      return { items: page.items, next_cursor: page.next }
    })

    expect(seen).toEqual([undefined, 'c2', 'c3'])
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('exhausts on a single page whose cursor is already null', async () => {
    const items = await walkPages<string>(async () => ({
      items: ['only'],
      next_cursor: null,
    }))
    expect(items).toEqual(['only'])
  })

  it('returns an empty array for an empty first page', async () => {
    const items = await walkPages<string>(async () => ({
      items: [],
      next_cursor: null,
    }))
    expect(items).toEqual([])
  })

  it('rejects the whole walk when a later page fails', async () => {
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<never>>()
      .mockImplementation(async (cursor) => {
        if (cursor === undefined) {
          return { items: ['a'], next_cursor: 'c2' } as never
        }
        throw new Error('page 2 died')
      })

    await expect(walkPages(fetchPage)).rejects.toThrow('page 2 died')
  })
})
