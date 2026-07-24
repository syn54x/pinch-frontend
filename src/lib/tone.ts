// The one tone → ink map. Every surface that colors a delta, a status line, or
// a KPI value picks from here — the palette of meanings is fixed even though
// each caller uses only a subset.
export const TONE_CLASS = {
  positive: 'text-success',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
  warning: 'text-warning',
} as const

export type Tone = keyof typeof TONE_CLASS
