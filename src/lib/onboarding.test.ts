import { describe, expect, it } from 'vitest'
import { onboardingStatsLine } from './onboarding'

describe('onboardingStatsLine', () => {
  it('shows the classification progress and the recurring count', () => {
    expect(
      onboardingStatsLine({
        classified: 234,
        transactions_total: 342,
        recurring_found: 7,
      }),
    ).toBe('Categorizing 234/342 · found 7 recurring')
  })

  it('omits the recurring fragment while it is still null', () => {
    expect(
      onboardingStatsLine({
        classified: 12,
        transactions_total: 342,
        recurring_found: null,
      }),
    ).toBe('Categorizing 12/342')
  })

  it('keeps a real zero recurring count (0 is not null)', () => {
    expect(
      onboardingStatsLine({
        classified: 342,
        transactions_total: 342,
        recurring_found: 0,
      }),
    ).toBe('Categorizing 342/342 · found 0 recurring')
  })
})
