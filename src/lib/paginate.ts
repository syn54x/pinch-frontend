// A generic cursor-walk: the Register export's `walkTransactionPages`
// pattern (F10 CP7, #93), lifted so any keyset-paginated `Page[T]` listing
// (imports/rows included) can be exhausted the same honest way — every
// page or none, never a partial set on a failed walk.

export type CursorPage<T> = {
  items: T[]
  next_cursor: string | null
}

/** Walk `fetchPage` from the first page (no cursor) through each
 * `next_cursor` until the API returns null, stitching items in listing
 * order. Any page failure rejects the whole walk. */
export async function walkPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor)
    items.push(...page.items)
    cursor = page.next_cursor ?? undefined
  } while (cursor !== undefined)
  return items
}
