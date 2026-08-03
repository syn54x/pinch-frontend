import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

// F4 CP0 (#58, wireframe s17): the Categories & Rules surface — one page,
// four tab routes. Tabs are links, so every tab is deep-linkable and each
// child route loads only its own data (CONTEXT.md: Categories & Rules).
export const Route = createFileRoute('/_authed/categories')({
  staticData: { title: 'Categories & Rules' },
  component: CategoriesShell,
})

const TABS = [
  { to: '/categories', label: 'Categories', exact: true },
  { to: '/categories/rules', label: 'Rules' },
  { to: '/categories/tags', label: 'Tags' },
  { to: '/categories/learning', label: 'Learning' },
] as const

function CategoriesShell() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav
        aria-label="Categories & Rules tabs"
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
