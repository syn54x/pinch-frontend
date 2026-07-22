import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  CreditCard,
  Inbox as InboxIcon,
  Link as LinkIcon,
  List,
} from 'lucide-react'
import { type ComponentType, type ReactNode, useState } from 'react'
import {
  countUnreviewedTransactionsOptions,
  logoutMutation,
  meOptions,
  requestEmailVerificationMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

// Screen titles live on the routes themselves (staticData); the shell's top
// bar shows the deepest match that declares one.
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
  }
}

// The App shell (CONTEXT.md): the persistent chrome every authed surface
// mounts inside — sidebar (brand, nav, user row) and top bar. Wireframe #24
// is the reference. F3 CP0 ships it lean: only surfaces that exist appear in
// the nav (no disabled destinations), and there are no Penny affordances and
// no ⌘K — what ⌘K means is decided when Penny lands (F6). The Inbox count
// badge is live (CP2): unreviewed-count, refreshed by review-mutation
// invalidation and window refocus.
export function AppShell({ children }: { children: ReactNode }) {
  const title = useRouterState({
    select: (state) =>
      state.matches.findLast((match) => match.staticData.title)?.staticData
        .title,
  })

  return (
    <div className="flex h-svh">
      <aside className="flex w-[212px] shrink-0 flex-col border-r bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-3.5">
          <div className="size-6 rounded-[7px] bg-primary" aria-hidden />
          <span className="font-semibold text-sm">Pinch</span>
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-[3px]">
          <NavItem to="/inbox" icon={InboxIcon}>
            Inbox
            <InboxCount />
          </NavItem>
          <NavItem to="/register" icon={List}>
            Register
          </NavItem>
          <NavItem to="/accounts" icon={CreditCard}>
            Accounts
          </NavItem>
          <div className="label-caps mt-3.5 mb-1 px-2">Setup</div>
          <NavItem to="/connections" icon={LinkIcon}>
            Connections
          </NavItem>
        </nav>
        <div className="flex-1" />
        <UserRow />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-3.5 border-b px-5">
          <h1 className="font-semibold text-sm">{title}</h1>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <VerifyEmailBanner />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon: Icon,
  children,
}: {
  to: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children: ReactNode
}) {
  // Wireframe .ni: 13px muted rows that go selected-bg + ink + semibold when
  // active; icons dim at rest. Active state rides aria-current so styling
  // and accessibility are the same fact.
  return (
    <Link
      to={to}
      activeProps={{ 'aria-current': 'page' }}
      className="flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:opacity-60 aria-[current=page]:[&>svg]:opacity-100"
    >
      <Icon aria-hidden />
      {children}
    </Link>
  )
}

function InboxCount() {
  // The live review count (wireframe #24's mono nav badge). Liveness is
  // invalidation + refocus, never polling: review mutations invalidate this
  // key, and TanStack's default refetchOnWindowFocus re-asks on return.
  // Zero hides the badge — inbox zero is a resting state, not a metric.
  const count = useQuery(countUnreviewedTransactionsOptions())
  if (count.data === undefined || count.data.count === 0) return null

  return (
    <span
      data-testid="inbox-count"
      className="ml-auto rounded-full bg-primary px-1.5 py-px font-mono font-semibold text-[10px] text-primary-foreground"
    >
      {count.data.count}
    </span>
  )
}

function UserRow() {
  // The guard already resolved /me; this render only reads the cache.
  const me = useQuery(meOptions())
  if (!me.data) return null
  const name = me.data.display_name.trim()

  return (
    <div className="mt-1 flex items-center gap-2.5 px-2 py-1.5">
      <div className="size-6 shrink-0 rounded-full bg-muted" aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-medium text-[11.5px]">
          {name || me.data.email}
        </p>
        {name && (
          <p className="truncate text-[10px] text-muted-foreground">
            {me.data.email}
          </p>
        )}
      </div>
    </div>
  )
}

function LogoutButton() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const logout = useMutation({
    ...logoutMutation(),
    onSuccess: () => {
      // The session is gone server-side; drop every cached answer that
      // presumed it (starting with /me) and go to login.
      queryClient.clear()
      router.history.push('/login')
    },
  })

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={logout.isPending}
      onClick={() => logout.mutate({})}
    >
      Log out
    </Button>
  )
}

function VerifyEmailBanner() {
  // Verification gates nothing (F1): a nudge for unverified users, nothing
  // more. Dismissal is per page-load state — it comes back on reload, which
  // is the right amount of persistent for a nudge.
  const me = useQuery(meOptions())
  const [dismissed, setDismissed] = useState(false)
  const resend = useMutation(requestEmailVerificationMutation())

  if (dismissed || !me.data || me.data.email_verified) return null

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b bg-muted px-6 py-2 text-sm"
    >
      <span>
        {resend.isSuccess
          ? 'Sent — check your inbox for a fresh link.'
          : `Verify your email — we sent a confirmation link to ${me.data.email}.`}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={resend.isPending}
          onClick={() => resend.mutate({})}
        >
          Resend
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </span>
    </div>
  )
}
