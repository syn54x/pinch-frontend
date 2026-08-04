import { describe, expect, it } from 'vitest'
import { resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('follows the OS when preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the OS for explicit preferences', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
