import { useEffect, useSyncExternalStore } from 'react'

// Theme preference: light, dark, or follow the OS (DESIGN.md's Three Themes
// Rule). The persisted value and the pre-paint script in index.html agree on
// this storage key; an absent or unknown value means "system".
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pinch-theme'

// Shared by every theme affordance (the Profile menu, the Preferences
// pane): one vocabulary for the tri-state control.
export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly { value: ThemePreference; label: string }[]

export function resolveTheme(
  pref: ThemePreference,
  systemDark: boolean,
): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
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

// One preference, many affordances (the Profile menu and the Preferences
// pane, F7): module-level state behind useSyncExternalStore, so every
// mounted control re-renders when any of them sets it. Per-component
// useState here once let the two controls disagree — the e2e "one setting"
// test is what keeps this honest.
let preference: ThemePreference | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): ThemePreference {
  if (preference === null) preference = getStoredTheme()
  return preference
}

// While the preference is "system", OS theme changes are followed live.
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, snapshot)

  useEffect(() => {
    apply(pref)
    if (pref !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  const setTheme = (next: ThemePreference) => {
    // "system" is the default: store nothing rather than a redundant value.
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
    preference = next
    for (const listener of listeners) listener()
  }

  return { preference: pref, setTheme }
}
