import { useEffect, useSyncExternalStore } from 'react'
import type {
  AccountKind,
  AccountOut,
  NetWorthOut,
} from '@/api/generated/types.gen'

// Your money (F10 CP3, wireframe s24): the sidebar's Cash / Investments /
// Property / Debt groups. Sourced from the net-worth report, not the plain
// accounts list, so group totals are real primary-currency sums (PRD #79's
// "Sidebar Your money reads the net-worth report" decision) — pure so the
// grouping + exclusion rule is unit-tested without a browser.

// The group vocabulary — one table, everything else below derives from it
// (the key union, the kind→group lookup, the display order, and the
// storage validity check all used to be four separate structures that had
// to agree by hand).
const GROUPS = [
  { key: 'cash', label: 'Cash', kinds: ['depository'] },
  { key: 'investments', label: 'Investments', kinds: ['investment'] },
  { key: 'property', label: 'Property', kinds: ['asset'] },
  { key: 'debt', label: 'Debt', kinds: ['loan', 'credit'] },
] as const satisfies readonly {
  key: string
  label: string
  kinds: readonly AccountKind[]
}[]

export type SidebarGroupKey = (typeof GROUPS)[number]['key']

const GROUP_OF = Object.fromEntries(
  GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key])),
) as Record<AccountKind, SidebarGroupKey>

const GROUP_KEYS: ReadonlySet<SidebarGroupKey> = new Set(
  GROUPS.map((group) => group.key),
)

export interface SidebarAccountRow {
  id: string
  label: string
  /** In the report's primary currency when the report converted this
   * account (`excluded: false`); in the account's own currency otherwise. */
  balanceMinor: number
  currency: string
  /** True when the report couldn't find an FX path for this account (v0's
   * FX is same-currency-only, fx.py `get_rate`) — it renders at its native
   * balance but never joins the group total. */
  excluded: boolean
}

export interface SidebarGroup {
  key: SidebarGroupKey
  label: string
  accounts: SidebarAccountRow[]
  /** The sum of every *non-excluded* row, in the report's primary currency —
   * a real sum, never a currency-blind add-up across mismatched accounts. */
  totalMinor: number
  currency: string
}

/** Groups the ledger's non-archived accounts into Your money's four
 * sections. The net-worth report's `accounts` array already excludes any
 * account it couldn't convert (no per-account trace survives in `excluded` —
 * it's a currency-only aggregate), so an account present in the full roster
 * but absent from the report's `accounts` is exactly the no-FX case: it
 * renders in its group at its own native balance, held out of the total. */
export function deriveSidebarGroups(
  accounts: AccountOut[],
  report: NetWorthOut,
): SidebarGroup[] {
  const reported = new Map(report.accounts.map((a) => [a.id, a]))

  return GROUPS.map(({ key, label }) => {
    const inGroup = accounts.filter(
      (account) => !account.archived && GROUP_OF[account.kind] === key,
    )
    const rows: SidebarAccountRow[] = inGroup.map((account) => {
      const match = reported.get(account.id)
      if (match !== undefined) {
        return {
          id: account.id,
          label: account.label,
          balanceMinor: match.balance_minor,
          currency: report.currency,
          excluded: false,
        }
      }
      return {
        id: account.id,
        label: account.label,
        balanceMinor: account.balance?.amount_minor ?? 0,
        currency: account.balance?.currency ?? account.currency,
        excluded: true,
      }
    })
    return {
      key,
      label,
      accounts: rows,
      totalMinor: rows
        .filter((row) => !row.excluded)
        .reduce((sum, row) => sum + row.balanceMinor, 0),
      currency: report.currency,
    }
  }).filter((group) => group.accounts.length > 0)
}

// Collapse state (per device, per the PRD): which groups are collapsed,
// persisted to localStorage. Module-level state behind
// useSyncExternalStore, the theme.ts pattern (lib/theme.ts) — one source of
// truth even if Your money ever mounts twice.

const STORAGE_KEY = 'pinch-sidebar-collapsed-groups'

function isGroupKey(value: unknown): value is SidebarGroupKey {
  return (GROUP_KEYS as ReadonlySet<unknown>).has(value)
}

/** Reads the persisted collapse set. Malformed or absent storage degrades to
 * "nothing collapsed" rather than throwing. */
export function readCollapsedGroups(): ReadonlySet<SidebarGroupKey> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter(isGroupKey))
  } catch {
    return new Set()
  }
}

function writeCollapsedGroups(keys: ReadonlySet<SidebarGroupKey>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
}

let collapsed: ReadonlySet<SidebarGroupKey> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): ReadonlySet<SidebarGroupKey> {
  if (collapsed === null) collapsed = readCollapsedGroups()
  return collapsed
}

/** Your money's collapse state — one set shared by every mounted instance,
 * synced to localStorage so it survives reload on this device. */
export function useCollapsedSidebarGroups() {
  const collapsedGroups = useSyncExternalStore(subscribe, snapshot)

  useEffect(() => {
    // Cross-tab: another tab's toggle updates this one too.
    function onStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== STORAGE_KEY) return
      collapsed = readCollapsedGroups()
      for (const listener of listeners) listener()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function toggle(key: SidebarGroupKey) {
    const next = new Set(collapsedGroups)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    writeCollapsedGroups(next)
    collapsed = next
    for (const listener of listeners) listener()
  }

  return { collapsed: collapsedGroups, toggle }
}
