import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Direct pokes at the e2e database — the same side-channel family as
// fishing mail tokens from the console-mailer log: never used to ASSERT
// (the UI seam does that), only to stage states the API deliberately
// refuses to fabricate.

const exec = promisify(execFile)

async function psql(sql: string): Promise<string> {
  // Mirrors the justfile's db modes: docker via local-pg locally,
  // direct psql against the service container in CI.
  const direct = process.env.E2E_DB_MODE === 'direct'
  const args = ['-U', 'postgres', '-d', 'pinch_e2e', '-t', '-c', sql]
  const { stdout } = direct
    ? await exec('psql', ['-h', 'localhost', ...args], {
        env: { ...process.env, PGPASSWORD: 'password' },
      })
    : await exec('docker', ['exec', 'local-pg', 'psql', ...args])
  return stdout.trim()
}

/** Single-quote a SQL literal (doubling embedded quotes). */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Stage a connection state the API would only reach via provider errors —
 * scoped to the given user's ledger so tests can never bleed into each
 * other. The frontend can't tell the difference: status drives the UI,
 * and that seam contract is exactly what the tests exercise. */
export async function forceConnectionStatus(
  email: string,
  status: 'error' | 'reauth_required',
  options: { errorDetail?: string; stripCredentials?: boolean } = {},
): Promise<void> {
  const detail = options.errorDetail ?? 'the connection needs your attention'
  const strip = options.stripCredentials ? ', encrypted_secret = NULL' : ''
  await psql(
    `UPDATE connection SET status = ${literal(status)}, error_detail = ${literal(detail)}${strip}
     WHERE ledger_id IN (
       SELECT lm.ledger_id FROM ledgermember lm
       JOIN "user" u ON u.id = lm.user_id
       WHERE u.email = ${literal(email)}
     )`,
  )
}
