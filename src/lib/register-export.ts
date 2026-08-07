import type { TransactionOut } from '@/api/generated/types.gen'
import { toCsv } from './csv'
import { formatMinorUnits } from './money'
import { walkPages } from './paginate'

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

/** The export's own name for the generic cursor-walk (F10 CP6, #92
 * generalized this into `walkPages`) — kept as a typed re-export so
 * ExportButton's call site still reads as "walk transactions", not a bare
 * generic. */
export async function walkTransactionPages(
  fetchPage: (cursor: string | undefined) => Promise<TransactionPage>,
): Promise<TransactionOut[]> {
  return walkPages<TransactionOut>(fetchPage)
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
