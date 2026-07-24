import type { LedgerStatsOut } from '@/api/generated/types.gen'

// Onboarding's progress voice (F5 CP6, wireframe s5 step 3): the classification
// counts F3's #20 cut "until M8" come back real, riding the wizard's existing
// bounded poll. Pure so the null-recurring edge is unit-tested without a browser.

/** "Categorizing 234/342 · found 7 recurring" — the recurring fragment is
 * omitted while `recurring_found` is still null (detection hasn't reported). */
export function onboardingStatsLine(
  stats: Pick<
    LedgerStatsOut,
    'classified' | 'transactions_total' | 'recurring_found'
  >,
): string {
  const base = `Categorizing ${stats.classified}/${stats.transactions_total}`
  return stats.recurring_found !== null
    ? `${base} · found ${stats.recurring_found} recurring`
    : base
}
