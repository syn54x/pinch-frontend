import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

// F7 CP1 (#70, wireframe s23): the Settings surface — account configuration
// you visit twice a year, opened from the Profile menu, never from the Setup
// nav (CONTEXT.md: Settings vs Setup). Tabs are links (the Categories & Rules
// pattern), so every pane is deep-linkable. Security and Developer API join
// in CP2; the wireframe's Ledger pane is cut (no backend exists).
export const Route = createFileRoute('/_authed/settings')({
  staticData: { title: 'Settings' },
  component: SettingsShell,
})

const TABS = [
  { to: '/settings', label: 'Profile', exact: true },
  { to: '/settings/preferences', label: 'Preferences' },
] as const

function SettingsShell() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav
        aria-label="Settings tabs"
        className="mb-5 flex w-fit gap-1 rounded-lg bg-muted p-1"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: 'exact' in tab && tab.exact }}
            activeProps={{ 'data-active': true }}
            className={cn(
              'rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm transition-colors',
              'hover:text-foreground',
              'data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
