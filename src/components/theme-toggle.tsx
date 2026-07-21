import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nextTheme, type ThemePreference, useTheme } from '@/lib/theme'

const LABELS: Record<ThemePreference, string> = {
  system: 'Theme: system. Switch to light.',
  light: 'Theme: light. Switch to dark.',
  dark: 'Theme: dark. Switch to system.',
}

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

// One button cycling system → light → dark. The icon shows the current
// preference (monitor = following the OS), the accessible name says both
// where it is and where a press goes.
export function ThemeToggle() {
  const { preference, setTheme } = useTheme()
  const Icon = ICONS[preference]

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={LABELS[preference]}
      title={LABELS[preference]}
      onClick={() => setTheme(nextTheme(preference))}
    >
      <Icon aria-hidden />
    </Button>
  )
}
