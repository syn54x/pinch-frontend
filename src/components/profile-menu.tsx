import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  logoutMutation,
  meOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { type ThemePreference, useTheme } from '@/lib/theme'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly { value: ThemePreference; label: string }[]

// The Profile menu (CONTEXT.md; wireframe s23b): the popout on the user row —
// identity header, theme, Log out. Account-scoped chrome only, nothing
// destructive; the Settings entry arrives with the surface (F7 CP1), never
// as a dead link before it.
export function ProfileMenu() {
  // The guard already resolved /me; this render only reads the cache.
  const me = useQuery(meOptions())
  const [open, setOpen] = useState(false)
  const { preference, setTheme } = useTheme()
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

  if (!me.data) return null
  const name = me.data.display_name.trim()
  // One fallback, both renderings: the trigger and the header must never
  // disagree about who you are.
  const label = name || me.data.email

  return (
    // Modal: the portaled content joins the Tab order (focus loops inside
    // until Escape/outside-click) — without it, keyboard users can never
    // reach the menu they just opened.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="profile-menu-trigger"
        aria-label="Profile menu"
        className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-2"
      >
        <span className="size-6 shrink-0 rounded-full bg-muted" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-medium text-[11.5px]">
            {label}
          </span>
          {name && (
            <span className="block truncate text-[10px] text-muted-foreground">
              {me.data.email}
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        data-testid="profile-menu"
        side="top"
        align="start"
        className="w-[228px] p-0"
      >
        <div className="border-b px-3 py-2.5">
          <p className="truncate font-medium text-[12px]">{label}</p>
          {name && (
            <p className="truncate text-[10.5px] text-muted-foreground">
              {me.data.email}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="label-caps">Theme</span>
          <SegmentedControl
            aria-label="Theme"
            value={preference}
            options={THEME_OPTIONS}
            onChange={setTheme}
          />
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={logout.isPending}
            onClick={() => logout.mutate({})}
          >
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
