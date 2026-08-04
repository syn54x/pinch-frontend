import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import {
  meOptions,
  meQueryKey,
  updateMeMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { MutationError } from '@/components/auth-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The Profile pane (F7 CP1, wireframe s23): who you are. Email is identity,
// read-only — change-email is a mailed-token flow deferred to
// hosted-hardening (#68's Out of Scope). Display name saves through the
// enabler's PATCH (backend #83) and the sidebar identity follows the /me
// cache, no reload.
export const Route = createFileRoute('/_authed/settings/')({
  component: ProfilePane,
})

function ProfilePane() {
  const me = useQuery(meOptions())
  const queryClient = useQueryClient()
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    ...updateMeMutation(),
    onSuccess: async () => {
      // Invalidate first, drop the draft after: the input must never flash
      // the pre-save name while /me refetches.
      await queryClient.invalidateQueries({ queryKey: meQueryKey() })
      setDraft(null)
    },
  })

  if (!me.data) return null
  const current = me.data.display_name
  const value = draft ?? current

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = value.trim()
    // Nothing changed (or nothing left) → nothing to save.
    if (trimmed === current || trimmed === '') return
    save.mutate({ body: { display_name: trimmed } })
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-sm">Profile</h2>
      <dl className="mt-4">
        <dt className="label-caps">Email</dt>
        <dd className="mt-1 text-sm">{me.data.email}</dd>
      </dl>
      <form onSubmit={onSubmit} className="mt-4">
        <Label htmlFor={inputId} className="label-caps">
          Display name
        </Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id={inputId}
            value={value}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
            className="max-w-xs"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={
              save.isPending || value.trim() === current || value.trim() === ''
            }
          >
            Save
          </Button>
        </div>
        <MutationError mutation={save} />
      </form>
    </Card>
  )
}
