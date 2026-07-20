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
  const { stdout } = direct
    ? await exec(
        'psql',
        [
          '-h',
          'localhost',
          '-U',
          'postgres',
          '-d',
          'pinch_e2e',
          '-t',
          '-c',
          sql,
        ],
        {
          env: { ...process.env, PGPASSWORD: 'password' },
        },
      )
    : await exec('docker', [
        'exec',
        'local-pg',
        'psql',
        '-U',
        'postgres',
        '-d',
        'pinch_e2e',
        '-t',
        '-c',
        sql,
      ])
  return stdout.trim()
}

/** Stage a connection status the API would only reach via provider errors.
 * The frontend can't tell the difference — status drives the UI, and that
 * seam contract is exactly what the tests exercise. */
export async function forceConnectionStatus(
  status: 'error' | 'reauth_required',
  errorDetail = 'the connection needs your attention',
): Promise<void> {
  await psql(
    `UPDATE connection SET status = '${status}', error_detail = '${errorDetail}'`,
  )
}
