import type { QueryKey } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import type { UIMessage } from 'ai'
import { useEffect, useRef } from 'react'
import {
  countUnreviewedTransactionsQueryKey,
  debtReportQueryKey,
  getCategoryQueryKey,
  getRuleQueryKey,
  getTransactionQueryKey,
  ledgerStatsQueryKey,
  listAccountsQueryKey,
  listCategoriesQueryKey,
  listCorrectionLogQueryKey,
  listRecurringQueryKey,
  listRulesQueryKey,
  listTagsQueryKey,
  listTransactionsQueryKey,
  listTransfersQueryKey,
  netWorthReportQueryKey,
  recurringReportQueryKey,
  spendingReportQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import { asToolPart, WRITE_TOOL_NAMES } from '@/lib/penny'

// Every ledger-scoped read family a write tool could touch, invalidated as
// one unit (PRD #45 decision 9: blanket, not a per-tool map — a bundle
// that grows new write tools needs zero change here, since a new tool can
// only ever land in one of these existing domains). Each factory is called
// with no options, which TanStack matches as a prefix — invalidating every
// cached page/filter/id variant of that endpoint in one call.
// getTransaction/getCategory/getRule require a real path id by their
// generated type — but a blanket, id-agnostic key is exactly what
// wholesale invalidation needs (whichever id Penny touched, this client
// never learns it from the tool output). Their `_id` string is the
// generated adapter's own naming, not one this file invents.
const anyPathQueryKey = <T>(factory: (options: T) => QueryKey) =>
  factory({ path: {} } as T)

const LEDGER_QUERY_KEYS = [
  listAccountsQueryKey,
  listTransactionsQueryKey,
  () => anyPathQueryKey(getTransactionQueryKey),
  countUnreviewedTransactionsQueryKey,
  ledgerStatsQueryKey,
  listCategoriesQueryKey,
  () => anyPathQueryKey(getCategoryQueryKey),
  listRulesQueryKey,
  () => anyPathQueryKey(getRuleQueryKey),
  listTagsQueryKey,
  listTransfersQueryKey,
  listRecurringQueryKey,
  recurringReportQueryKey,
  netWorthReportQueryKey,
  debtReportQueryKey,
  spendingReportQueryKey,
  listCorrectionLogQueryKey,
] as const

/** Fires blanket invalidation once per write tool call that actually took
 * effect (`output-available`) — never for a denial or an expired approval,
 * which changed nothing. */
export function useWriteInvalidation(messages: UIMessage[]): void {
  const queryClient = useQueryClient()
  const seen = useRef(new Set<string>())

  // biome-ignore lint/correctness/useExhaustiveDependencies: fires per newly-settled tool call in the stream, not per queryClient identity
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        const tool = asToolPart(part)
        if (!tool || !WRITE_TOOL_NAMES.has(tool.toolName)) continue
        if (tool.state !== 'output-available') continue
        if (seen.current.has(tool.toolCallId)) continue
        seen.current.add(tool.toolCallId)
        for (const queryKey of LEDGER_QUERY_KEYS) {
          void queryClient.invalidateQueries({ queryKey: queryKey() })
        }
      }
    }
  }, [messages])
}
