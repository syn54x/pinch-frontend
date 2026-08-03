import { createFileRoute, Outlet } from '@tanstack/react-router'

// F4 CP2 (#60): the Rules tab family — the list at the index, the builder
// at /new and /$ruleId, all inside the Categories & Rules shell.
export const Route = createFileRoute('/_authed/categories/rules')({
  component: Outlet,
})
