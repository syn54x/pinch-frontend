import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { authedContext } from './api'

// Inbox seeding (F3 CP2): everything the real stack can produce goes
// through the real stack — categories and rules via the API *before* the
// fake-bank sync, so the pipeline itself mints rule/none provenance on the
// synced transactions. Only what the pipeline cannot produce (ai — v0
// deterministically abstains) is DB-staged, following helpers/db.ts:
// side-channel staging only, never asserting.

const exec = promisify(execFile)

async function psql(sql: string): Promise<string> {
  // Mirrors helpers/db.ts: docker via local-pg locally, direct psql in CI.
  const direct = process.env.E2E_DB_MODE === 'direct'
  const args = ['-U', 'postgres', '-d', 'pinch_e2e', '-t', '-c', sql]
  const { stdout } = direct
    ? await exec('psql', ['-h', 'localhost', ...args], {
        env: { ...process.env, PGPASSWORD: 'password' },
      })
    : await exec('docker', ['exec', 'local-pg', 'psql', ...args])
  return stdout.trim()
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Create a category through the API; returns its id. */
export async function createCategory(
  email: string,
  password: string,
  name: string,
): Promise<string> {
  const { ctx, csrf } = await authedContext(email, password)
  try {
    const created = await ctx.post('/api/v1/categories', {
      data: { name },
      headers: await csrf(),
    })
    if (!created.ok()) {
      throw new Error(
        `seed category failed: ${created.status()} ${await created.text()}`,
      )
    }
    const { id } = (await created.json()) as { id: string }
    return id
  } finally {
    await ctx.dispose()
  }
}

/** Create an active payee-contains rule through the API. Created before the
 * connection, so the first sync's pipeline classifies with it — genuine
 * `rule` provenance, no staging. */
export async function createPayeeRule(
  email: string,
  password: string,
  options: { contains: string; categoryId: string },
): Promise<void> {
  const { ctx, csrf } = await authedContext(email, password)
  try {
    const created = await ctx.post('/api/v1/rules', {
      data: {
        condition: {
          payee: { op: 'contains', value: options.contains },
        },
        action_category_id: options.categoryId,
      },
      headers: await csrf(),
    })
    if (!created.ok()) {
      throw new Error(
        `seed rule failed: ${created.status()} ${await created.text()}`,
      )
    }
  } finally {
    await ctx.dispose()
  }
}

/** Stage exactly one `ai`-provenance proposal (with the named category) on
 * an unreviewed transaction of the user's ledger. The classifier
 * deterministically abstains in v0, so this state is unreachable through
 * the API — the one DB-staged provenance (#18). */
export async function stageAiProposal(
  email: string,
  categoryName: string,
): Promise<void> {
  const updated = await psql(
    `UPDATE proposal SET provenance = 'ai', category_id = (
       SELECT c.id FROM category c
       WHERE c.ledger_id = proposal.ledger_id AND c.name = ${literal(categoryName)}
     )
     WHERE id = (
       SELECT p.id FROM proposal p
       JOIN "transaction" t ON t.id = p.transaction_id
       WHERE p.ledger_id IN (
         SELECT lm.ledger_id FROM ledgermember lm
         JOIN "user" u ON u.id = lm.user_id
         WHERE u.email = ${literal(email)}
       )
       AND p.provenance = 'none' AND t.reviewed_at IS NULL
       ORDER BY p.id LIMIT 1
     )
     RETURNING id`,
  )
  // psql prints the command tag even under -t: "UPDATE 1" on success.
  if (!updated.includes('UPDATE 1')) {
    throw new Error(
      `stageAiProposal found no unreviewed none-proposal to stage (${updated})`,
    )
  }
}

/** Review one unreviewed transaction through the API — out-of-band relative
 * to the browser session, for proving refocus liveness. */
export async function reviewOneViaApi(
  email: string,
  password: string,
): Promise<void> {
  const { ctx, csrf } = await authedContext(email, password)
  try {
    const listed = await ctx.get('/api/v1/transactions?reviewed=false&limit=1')
    const { items } = (await listed.json()) as { items: Array<{ id: string }> }
    if (items.length === 0) throw new Error('nothing left to review via API')
    const reviewed = await ctx.post(
      `/api/v1/transactions/${items[0].id}/review`,
      { data: {}, headers: await csrf() },
    )
    if (!reviewed.ok()) {
      throw new Error(
        `api review failed: ${reviewed.status()} ${await reviewed.text()}`,
      )
    }
  } finally {
    await ctx.dispose()
  }
}
