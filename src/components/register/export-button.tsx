import { Download, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { listTransactions } from '@/api/generated/sdk.gen'
import { Button } from '@/components/ui/button'
import { downloadFile } from '@/lib/csv'
import {
  exportFilename,
  transactionsToCsv,
  walkTransactionPages,
} from '@/lib/register-export'
import { type RegisterSearch, toListQuery } from './model'

// F10 CP7 (#93): the wireframe's Export chip. On click the client walks the
// listing's keyset cursor to exhaustion with the current filters — the file
// is what the filters say, never what the viewport saw — then serializes
// and downloads in the browser (the Tags-tab export pattern). A failed walk
// downloads nothing: the button flips to a retry state instead.

// Pages of 100 (the API max): the walk is a bulk read, not a scroll.
const EXPORT_PAGE_SIZE = 100

type ExportState = 'idle' | 'working' | 'error'

export function ExportButton({ search }: { search: RegisterSearch }) {
  const [state, setState] = useState<ExportState>('idle')

  async function exportCsv() {
    setState('working')
    // The filter set is captured at click time — a filter change mid-walk
    // doesn't corrupt the file already being assembled.
    const query = toListQuery(search)
    try {
      const rows = await walkTransactionPages(async (cursor) => {
        const { data } = await listTransactions({
          query: { ...query, cursor, limit: EXPORT_PAGE_SIZE },
          throwOnError: true,
        })
        return data
      })
      downloadFile(exportFilename(), transactionsToCsv(rows))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="ml-auto rounded-full text-[11.5px]"
      data-testid="register-export"
      aria-busy={state === 'working'}
      disabled={state === 'working'}
      onClick={exportCsv}
    >
      {state === 'working' ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden /> Exporting…
        </>
      ) : (
        <>
          <Download aria-hidden />{' '}
          {state === 'error' ? 'Export failed — retry' : 'Export'}
        </>
      )}
    </Button>
  )
}
