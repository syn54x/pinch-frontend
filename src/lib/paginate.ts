// A generic cursor-walk (F10 CP6, #92): the ONE implementation of the
// Register export's cursor-to-exhaustion pattern (F10 CP7, #93). Both
// register-export.ts's `walkTransactionPages` and the CSV import wizard's
// row/account/uncategorized-transaction walks delegate here — any
// keyset-paginated `Page[T]` listing is exhausted the same honest way,
// every page or none, never a partial set on a failed walk.

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
