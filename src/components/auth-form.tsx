import { errorDetail } from '@/api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The email field every credential form shares. */
export function EmailField() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
    </div>
  )
}

/** The password field. New passwords carry the backend's NIST-baseline
 * length floor; existing ones must arrive as typed. */
export function PasswordField({
  label = 'Password',
  autoComplete,
}: {
  label?: string
  autoComplete: 'current-password' | 'new-password'
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="password">{label}</Label>
      <Input
        id="password"
        name="password"
        type="password"
        required
        minLength={autoComplete === 'new-password' ? 8 : undefined}
        autoComplete={autoComplete}
      />
    </div>
  )
}

/** Inline slot for a mutation's backend error, rendered as the form's alert. */
export function MutationError({
  mutation,
}: {
  mutation: { isError: boolean; error: unknown }
}) {
  if (!mutation.isError) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {errorDetail(mutation.error)}
    </p>
  )
}
