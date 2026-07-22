import { authedContext } from './api'

// Transfer-detection seeding support (F3 CP3). The honest seam: manual
// transaction creation defers the same classify job as a sync (backend
// api/transactions.py), whose post-classification pass IS the detector —
// so mirrored det fixtures are just two bare opposite legs on different
// accounts within the 5-day window, then waiting for the worker. No DB
// staging, no Plaid: the provenance is the real pipeline's.

export interface UnreviewedTxn {
  id: string
  description_raw: string
  amount_minor: number
  proposal: {
    provenance: string
    proposed_transfer: boolean
    counterpart_transaction_id?: string | null
  } | null
}

/** Poll the unreviewed list until `predicate` holds; returns the matching
 * snapshot. The worker's classify job is async — this is the seam's only
 * wait, bounded and explained. */
export async function pollUnreviewed(
  email: string,
  password: string,
  predicate: (items: UnreviewedTxn[]) => boolean,
  label: string,
  timeoutMs = 90_000,
): Promise<UnreviewedTxn[]> {
  const { ctx } = await authedContext(email, password)
  try {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const response = await ctx.get(
        '/api/v1/transactions?reviewed=false&limit=100',
      )
      if (response.ok()) {
        const { items } = (await response.json()) as { items: UnreviewedTxn[] }
        if (predicate(items)) return items
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${label}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  } finally {
    await ctx.dispose()
  }
}

/** Wait until the detector has written its mirrored proposals — both legs
 * carrying proposed_transfer, each naming the other. */
export async function waitForDetectedPair(
  email: string,
  password: string,
): Promise<void> {
  await pollUnreviewed(
    email,
    password,
    (items) =>
      items.filter((txn) => txn.proposal?.proposed_transfer === true).length >=
      2,
    'the detector to propose the mirrored pair',
  )
}
