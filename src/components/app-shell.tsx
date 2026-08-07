import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  CreditCard,
  Home,
  Inbox as InboxIcon,
  Link as LinkIcon,
  List,
  RefreshCw,
  Shapes,
} from 'lucide-react'
import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import {
  countUnreviewedTransactionsOptions,
  meOptions,
  requestEmailVerificationMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { PennyChips } from '@/components/penny/history'
import { ProfileMenu } from '@/components/profile-menu'
import { Button } from '@/components/ui/button'

// Screen titles live on the routes themselves (staticData); the shell's top
// bar shows the deepest match that declares one. fullBleed lets a surface
// own its scroll and edges (the Penny screen's thread + pinned composer,
// wireframe s22) instead of sitting in the padded scroller.
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
    fullBleed?: boolean
  }
}

// The App shell (CONTEXT.md): the persistent chrome every authed surface
// mounts inside — sidebar (brand, nav, Penny pill, user row) and top bar
// (title, Ask Penny). Wireframe #24 is the reference. Only surfaces that
// exist appear in the nav (no disabled destinations). ⌘K is Penny's key,
// permanently (F6 CP2, resolving #15's open question): summon from
// anywhere, focus the composer when already there — never a toggle, never
// a command palette (a future palette is reserved to ⌘P; do not bind it).
// The Inbox count badge is live: unreviewed-count, refreshed by
// review-mutation invalidation and window refocus.
export function AppShell({ children }: { children: ReactNode }) {
  const title = useRouterState({
    select: (state) =>
      state.matches.findLast((match) => match.staticData.title)?.staticData
        .title,
  })
  const fullBleed = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.staticData.fullBleed),
  })
  const onPenny = useRouterState({
    select: (state) => state.location.pathname.startsWith('/penny'),
  })
  const navigate = useNavigate()

  // ⌘K / Ctrl+K, globally: navigate to Penny; on her screen, focus the
  // composer instead (idempotent — the key never leaves a conversation).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey))
        return
      if (event.altKey || event.shiftKey) return
      event.preventDefault()
      if (onPenny) {
        document
          .querySelector<HTMLInputElement>('input[aria-label="Ask Penny"]')
          ?.focus()
      } else {
        void navigate({ to: '/penny' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onPenny, navigate])

  return (
    <div className="flex h-svh">
      <aside className="flex w-[212px] shrink-0 flex-col border-r bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-3.5">
          <div className="size-6 rounded-[7px] bg-primary" aria-hidden />
          <span className="font-semibold text-sm">Pinch</span>
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-[3px]">
          <NavItem to="/dashboard" icon={Home}>
            Dashboard
          </NavItem>
          <NavItem to="/inbox" icon={InboxIcon}>
            Inbox
            <InboxCount />
          </NavItem>
          <NavItem to="/register" icon={List}>
            Register
          </NavItem>
          {/* Net Worth left the nav with F10 CP2 (#88): the page is absorbed
              into Accounts, and the nav shows only surfaces that exist. */}
          <NavItem to="/recurring" icon={RefreshCw}>
            Recurring
          </NavItem>
          <NavItem to="/accounts" icon={CreditCard}>
            Accounts
          </NavItem>
          <div className="label-caps mt-3.5 mb-1 px-2">Setup</div>
          <NavItem to="/connections" icon={LinkIcon}>
            Connections
          </NavItem>
          <NavItem to="/categories" icon={Shapes}>
            Categories & Rules
          </NavItem>
        </nav>
        <div className="flex-1" />
        <PennyPill active={onPenny} />
        <ProfileMenu />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-3.5 border-b px-5">
          <h1 className="font-semibold text-sm">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* s22: on the Penny screen the top bar carries her verbs
                instead of the (redundant) summon pill. Theme and logout
                live in the Profile menu (F7 CP0) — the bar stays lean. */}
            {onPenny ? <PennyChips /> : <AskPenny />}
          </div>
        </header>
        <VerifyEmailBanner />
        <main
          className={
            fullBleed
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex-1 overflow-y-auto p-6'
          }
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function PennyPill({ active }: { active: boolean }) {
  // The sidebar Penny pill (wireframe s24 at rest, s22 active): a
  // card-surface bordered row above the user row. Active — on the Penny
  // screen — it wears her border and the copy flips to "open". In dark
  // mode the pill is one of the two sanctioned glow surfaces (DESIGN.md
  // §Elevation); in light, this purple dot is Penny's alone.
  return (
    <Link
      to="/penny"
      data-testid="penny-pill"
      aria-current={active ? 'page' : undefined}
      className={`mt-1.5 flex items-center gap-[9px] rounded-[10px] border bg-card px-2.5 py-[9px] transition-colors dark:shadow-[0_0_22px_-8px_rgba(161,121,242,0.5)] ${
        active
          ? 'border-penny dark:border-penny/60'
          : 'hover:border-penny/50 dark:border-penny/40'
      }`}
    >
      <span
        aria-hidden
        className="size-[22px] shrink-0 rounded-full bg-penny"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-[11.5px]">
          {active ? 'Penny' : 'Ask Penny'}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {active ? 'open · ⌘K' : '⌘K · always here'}
        </span>
      </span>
    </Link>
  )
}

function AskPenny() {
  // The top-bar pill (wireframe s24): Penny reachable from every screen.
  return (
    <Link
      to="/penny"
      data-testid="ask-penny"
      className="flex h-[30px] items-center gap-[7px] rounded-md border bg-card px-[11px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <span aria-hidden className="size-3.5 rounded-full bg-penny" />
      Ask Penny
      <kbd className="rounded border px-1 py-px font-mono font-semibold text-[10px]">
        ⌘K
      </kbd>
    </Link>
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
