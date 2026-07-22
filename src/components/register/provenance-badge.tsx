import { cn } from '@/lib/utils'
import { PROVENANCE_LABEL, type ProvenanceKind } from './model'

const PROV_CLASS: Record<ProvenanceKind, string> = {
  rule: 'text-prov-rule',
  history: 'text-prov-hist',
  ai: 'text-prov-ai',
  detection: 'text-prov-det',
}

// The provenance badge (DESIGN.md): mono-caps chip on a self-tint with a
// leading dot — the trust lineage of a categorization (rule/hist/ai/det).
// Tint ratios per the token contract: /13 light, /20 dark, with the dark
// inset ring the wireframe adds.
export function ProvenanceBadge({
  provenance,
  className,
}: {
  provenance: ProvenanceKind
  className?: string
}) {
  return (
    <span
      data-testid="provenance-badge"
      title={`Categorized by ${provenance}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono font-semibold text-[10px] uppercase tracking-[0.03em]',
        'bg-[color-mix(in_oklch,currentColor_13%,transparent)] dark:bg-[color-mix(in_oklch,currentColor_20%,transparent)] dark:shadow-[inset_0_0_0_1px_color-mix(in_oklch,currentColor_30%,transparent)]',
        PROV_CLASS[provenance],
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
        data-slot="dot"
      />
      {PROVENANCE_LABEL[provenance]}
    </span>
  )
}
