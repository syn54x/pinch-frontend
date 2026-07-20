import { describe, expect, it, vi } from 'vitest'
import { relativeTime } from './time'

// The suite's first unit test: relativeTime is pure logic the e2e seam
// can't exercise until syncs run (CP1) — exactly the case the standing
// posture reserves component tests for.
describe('relativeTime', () => {
  const NOW = new Date('2026-07-20T12:00:00Z')

  it('renders each coarse unit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      expect(relativeTime('2026-07-20T11:59:30Z')).toBe('just now')
      expect(relativeTime('2026-07-20T11:55:00Z')).toBe('5 minutes ago')
      expect(relativeTime('2026-07-20T09:00:00Z')).toBe('3 hours ago')
      expect(relativeTime('2026-07-18T12:00:00Z')).toBe('2 days ago')
      expect(relativeTime('2026-05-20T12:00:00Z')).toBe('2 months ago')
      expect(relativeTime('2024-07-20T12:00:00Z')).toBe('2 years ago')
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles a slightly-future timestamp (clock skew) without lying', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      expect(relativeTime('2026-07-20T12:00:20Z')).toBe('just now')
    } finally {
      vi.useRealTimers()
    }
  })
})
