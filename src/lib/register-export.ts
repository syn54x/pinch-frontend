import type { TransactionOut } from '@/api/generated/types.gen'
import { toCsv } from './csv'
import { formatMinorUnits } from './money'

// F10 CP7 (#93): Register export — the client walks the list query's keyset
// cursor to exhaustion with the active filters, then serializes to CSV in
// the browser (the Tags-tab export pattern; server-side export is
// deliberately deferred). The file is what the filters say, never what the
// viewport saw. Pure logic only: the button owns the fetching and the
// download side effects.

export type TransactionPage = {
  items: TransactionOut[]
  next_cursor: string | null
}

/** Walk the cursor to exhaustion: first page (no cursor), then each
 * `next_cursor` until the API returns null, stitched in listing order.
 * Any page failure rejects the whole walk — callers never see a partial
 * set, so a failed export downloads nothing rather than a truncated file. */
export async function walkTransactionPages(
  fetchPage: (cursor: string | undefined) => Promise<TransactionPage>,
): Promise<TransactionOut[]> {
  const items: TransactionOut[] = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor)
    items.push(...page.items)
    cursor = page.next_cursor ?? undefined
  } while (cursor !== undefined)
  return items
}

export const EXPORT_HEADER = [
  'date',
  'payee',
  'category',
  'tags',
  'amount',
  'currency',
  'pending',
  'notes',
]

/** Rows in listing order, shaped like the register reads them: the
 * display-name override when set (else the raw description), the applied
 * category, tags space-joined, the amount as a signed localized figure
 * (the Tags-tab export's voice). RFC 4180 quoting via toCsv. */
export function transactionsToCsv(rows: TransactionOut[]): string {
  return toCsv(
    EXPORT_HEADER,
    rows.map((txn) => [
      txn.date,
      txn.display_name ?? txn.description_raw,
      txn.category?.name ?? '',
      txn.tags.map((tag) => tag.name).join(' '),
      formatMinorUnits(txn.amount_minor, txn.currency),
      txn.currency,
      txn.pending ? 'pending' : '',
      txn.notes ?? '',
    ]),
  )
}

/** `pinch-register-YYYY-MM-DD.csv`, local-time dated — the filters already
 * shaped the contents; the name just says what and when. */
export function exportFilename(today = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `pinch-register-${today.getFullYear()}-${month}-${day}.csv`
}
