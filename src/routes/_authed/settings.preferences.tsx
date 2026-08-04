import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useId } from 'react'
import {
  meOptions,
  meQueryKey,
  updateMeMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { MutationError } from '@/components/auth-form'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { currencyLabel, currencyOptions } from '@/lib/currencies'
import { THEME_OPTIONS, useTheme } from '@/lib/theme'

// The Preferences pane (F7 CP1, wireframe s23): primary currency (reports &
// totals) and theme. The theme control is the same preference the Profile
// menu edits — one source (lib/theme), two affordances.
export const Route = createFileRoute('/_authed/settings/preferences')({
  component: PreferencesPane,
})

function PreferencesPane() {
  const me = useQuery(meOptions())
  const queryClient = useQueryClient()
  const selectId = useId()
  const { preference, setTheme } = useTheme()
  const save = useMutation({
    ...updateMeMutation(),
    // Awaited: the mutation stays pending until /me refetches, so the
    // select below never flashes the old value between save and refetch.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey() }),
  })

  if (!me.data) return null
  const current = save.isPending
    ? (save.variables?.body?.primary_currency ?? me.data.primary_currency)
    : me.data.primary_currency
  const codes = currencyOptions(current)

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-sm">Preferences</h2>
      <div className="mt-4">
        <Label htmlFor={selectId} className="label-caps">
          Primary currency
        </Label>
        <select
          id={selectId}
          className="mt-1.5 h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm focus-visible:outline-2"
          value={current}
          disabled={save.isPending}
          onChange={(event) =>
            save.mutate({ body: { primary_currency: event.target.value } })
          }
        >
          {codes.map((code) => (
            <option key={code} value={code}>
              {currencyLabel(code)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-muted-foreground text-xs">
          Reports and totals speak this currency.
        </p>
        <MutationError mutation={save} />
      </div>
      <div className="mt-5">
        <span className="label-caps">Theme</span>
        <div className="mt-1.5 w-fit">
          <SegmentedControl
            aria-label="Theme"
            value={preference}
            options={THEME_OPTIONS}
            onChange={setTheme}
          />
        </div>
        <p className="mt-1.5 text-muted-foreground text-xs">
          Also in the profile menu — same setting, one source.
        </p>
      </div>
    </Card>
  )
}
