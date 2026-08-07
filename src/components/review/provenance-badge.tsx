import type { ProposalProvenance } from '@/api/generated/types.gen'
import { cn } from '@/lib/utils'

// The trust lineage of a proposal (DESIGN.md): a mono-caps chip — leading
// dot + RULE/HIST/AI/DET/— — colored text on a tint of itself (/13 light,
// /20 dark, per the wireframe extraction in index.css). `none` is a
// legitimate state, not an error: muted on fill, never destructive.

const LABEL: Record<ProposalProvenance, string> = {
  rule: 'rule',
  history: 'hist',
  ai: 'ai',
  detection: 'det',
  none: '—',
}

/** Spelled out for assistive tech — the visual label is a ledger glyph. */
const MEANING: Record<ProposalProvenance, string> = {
  rule: 'proposed by rule',
  history: 'proposed from history',
  ai: 'proposed by AI',
  detection: 'detected transfer',
  none: 'no proposal',
}

// Light-mode ink is the token deepened 20% toward black: the raw tokens are
// AA on card, but on their own /13 tint (and on a selected row's accent
// surface) they measure ~4.0 — the mix holds ≥5:1 in every light context,
// canvas-measured. Dark tokens already clear 6:1 on their /20 tints, so
// dark uses them raw.
const TINT: Record<ProposalProvenance, string> = {
  rule: 'bg-prov-rule/13 text-[color-mix(in_oklch,var(--prov-rule)_80%,black)] dark:bg-prov-rule/20 dark:text-prov-rule',
  history:
    'bg-prov-hist/13 text-[color-mix(in_oklch,var(--prov-hist)_80%,black)] dark:bg-prov-hist/20 dark:text-prov-hist',
  ai: 'bg-prov-ai/13 text-[color-mix(in_oklch,var(--prov-ai)_80%,black)] dark:bg-prov-ai/20 dark:text-prov-ai',
  detection:
    'bg-prov-det/13 text-[color-mix(in_oklch,var(--prov-det)_80%,black)] dark:bg-prov-det/20 dark:text-prov-det',
  none: 'bg-muted text-[color-mix(in_oklch,var(--muted-foreground)_80%,black)] dark:text-muted-foreground',
}

export function ProvenanceBadge({
  provenance,
  className,
}: {
  provenance: ProposalProvenance
  className?: string
}) {
  return (
    <span
      data-testid="provenance-badge"
      data-provenance={provenance}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-px font-mono font-semibold text-[10px] uppercase tracking-[0.03em]',
        TINT[provenance],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      <span aria-hidden>{LABEL[provenance]}</span>
      <span className="sr-only">{MEANING[provenance]}</span>
    </span>
  )
}
