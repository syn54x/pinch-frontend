import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { countUnreviewedTransactionsOptions } from '@/api/generated/@tanstack/react-query.gen'
import { cn } from '@/lib/utils'
import type { RegisterView } from './model'

// The Register's view tabs (F10 CP1, wireframe s7): All · To review · N ·
// Uncategorized. Each tab is a link — the view rides the URL beside the
// filter params, so the queue is linkable and Back walks tabs. Switching
// tabs keeps the filter params in place (inert on To-review, live again on
// All and Uncategorized).
export function ViewTabs({ view }: { view: RegisterView | undefined }) {
  // The same cache entry as the nav badge: one number, told once. Zero
  // hides the number — the tab stays, the metric retires.
  const count = useQuery(countUnreviewedTransactionsOptions())
  const unreviewed = count.data?.count ?? 0

  return (
    <nav
      aria-label="Register views"
      className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
    >
      <ViewTab view={undefined} active={view === undefined} testId="view-all">
        All
      </ViewTab>
      <ViewTab view="review" active={view === 'review'} testId="view-review">
        To review{unreviewed > 0 ? ` · ${unreviewed}` : ''}
      </ViewTab>
      <ViewTab
        view="uncategorized"
        active={view === 'uncategorized'}
        testId="view-uncategorized"
      >
        Uncategorized
      </ViewTab>
    </nav>
  )
}

function ViewTab({
  view,
  active,
  testId,
  children,
}: {
  view: RegisterView | undefined
  active: boolean
  testId: string
  children: ReactNode
}) {
  return (
    <Link
      to="/register"
      search={(prev) => ({ ...prev, view })}
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-[11.5px] transition-colors focus-visible:outline-2',
        active
          ? 'border-transparent bg-primary font-medium text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}
