import { useEffect, useState } from 'react'

// Theme preference: light, dark, or follow the OS (DESIGN.md's Three Themes
// Rule). The persisted value and the pre-paint script in index.html agree on
// this storage key; an absent or unknown value means "system".
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pinch-theme'
const CYCLE: ThemePreference[] = ['system', 'light', 'dark']

export function resolveTheme(
  pref: ThemePreference,
  systemDark: boolean,
): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

export function nextTheme(pref: ThemePreference): ThemePreference {
  return CYCLE[(CYCLE.indexOf(pref) + 1) % CYCLE.length]
}

export function getStoredTheme(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

function apply(pref: ThemePreference) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle(
    'dark',
    resolveTheme(pref, systemDark) === 'dark',
  )
}

// Preference state + applier. While the preference is "system", OS theme
// changes are followed live.
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme)

  useEffect(() => {
    apply(preference)
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const setTheme = (pref: ThemePreference) => {
    // "system" is the default: store nothing rather than a redundant value.
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
    setPreference(pref)
  }

  return { preference, setTheme }
}
