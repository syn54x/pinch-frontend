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

const LEDGER_OF = (email: string) =>
  `SELECT lm.ledger_id FROM ledgermember lm
   JOIN "user" u ON u.id = lm.user_id
   WHERE u.email = ${literal(email)}`

/** Stage the M10 retrofit posture: the connection lacks investments
 * consent. The API only reaches this via Plaid's consent error — exactly
 * the state it refuses to fabricate on demand. */
export async function forceInvestmentsConsent(email: string): Promise<void> {
  await psql(
    `UPDATE connection SET investments_consent_required = true,
       investments_error_detail = NULL
     WHERE ledger_id IN (${LEDGER_OF(email)})`,
  )
}

/** Remove any holdings/activities/securities a real sandbox sync may have
 * landed — staging "connected but nothing granted yet" deterministically. */
export async function clearInvestments(email: string): Promise<void> {
  await psql(
    `WITH the_ledger AS (${LEDGER_OF(email)})
     , gone_activities AS (
       DELETE FROM investmentactivity
       WHERE ledger_id IN (SELECT ledger_id FROM the_ledger))
     , gone_holdings AS (
       DELETE FROM holding
       WHERE ledger_id IN (SELECT ledger_id FROM the_ledger))
     DELETE FROM security
     WHERE ledger_id IN (SELECT ledger_id FROM the_ledger)`,
  )
}

/** Stage holdings + activity for the user's investment account. Holdings
 * are provider-owned with no write API (ADR 0007 — read-only by law), so
 * the DB side-channel is the only way to fabricate them; the UI seam does
 * all the asserting. Mirrors the backend's own test fixture shapes. */
export async function stageInvestments(email: string): Promise<void> {
  await psql(
    `WITH the_ledger AS (${LEDGER_OF(email)})
     , the_account AS (
       SELECT a.id, a.ledger_id FROM account a
       WHERE a.ledger_id IN (SELECT ledger_id FROM the_ledger)
         AND a.kind = 'investment'
       ORDER BY a.created_at LIMIT 1)
     , sec_aapl AS (
       INSERT INTO security (id, ledger_id, provider_security_id, name,
         ticker_symbol, type, is_cash_equivalent, created_at, updated_at)
       SELECT gen_random_uuid(), t.ledger_id, 'e2e-sec-aapl', 'Apple Inc.',
         'AAPL', 'equity', false, now(), now()
       FROM the_account t RETURNING id, ledger_id)
     , sec_vti AS (
       INSERT INTO security (id, ledger_id, provider_security_id, name,
         ticker_symbol, type, is_cash_equivalent, created_at, updated_at)
       SELECT gen_random_uuid(), t.ledger_id, 'e2e-sec-vti',
         'Vanguard Total Stock Market ETF', 'VTI', 'etf', false, now(), now()
       FROM the_account t RETURNING id, ledger_id)
     , h1 AS (
       INSERT INTO holding (id, ledger_id, account_id, security_id, quantity,
         institution_price, institution_price_as_of, institution_value_minor,
         cost_basis_minor, currency, created_at, updated_at)
       SELECT gen_random_uuid(), t.ledger_id, t.id, s.id, 10.5, 190.1234,
         CURRENT_DATE, 199630, 150055, 'USD', now(), now()
       FROM the_account t, sec_aapl s RETURNING id)
     , h2 AS (
       INSERT INTO holding (id, ledger_id, account_id, security_id, quantity,
         institution_price, institution_price_as_of, institution_value_minor,
         cost_basis_minor, currency, created_at, updated_at)
       SELECT gen_random_uuid(), t.ledger_id, t.id, s.id, 4.5, 266.67,
         CURRENT_DATE, 120000, 110000, 'USD', now(), now()
       FROM the_account t, sec_vti s RETURNING id)
     , a1 AS (
       INSERT INTO investmentactivity (id, ledger_id, account_id, security_id,
         provider_activity_id, "date", name, amount_minor, quantity, price,
         fees_minor, type, subtype, currency, created_at, updated_at)
       SELECT gen_random_uuid(), t.ledger_id, t.id, s.id, 'e2e-act-buy',
         CURRENT_DATE - 7, 'BUY APPLE INC', -77000, 0.4, 190.0, 25,
         'buy', 'buy', 'USD', now(), now()
       FROM the_account t, sec_aapl s RETURNING id)
     INSERT INTO investmentactivity (id, ledger_id, account_id, security_id,
       provider_activity_id, "date", name, amount_minor, quantity, price,
       fees_minor, type, subtype, currency, created_at, updated_at)
     SELECT gen_random_uuid(), t.ledger_id, t.id, s.id, 'e2e-act-div',
       CURRENT_DATE - 3, 'AAPL DIVIDEND', 872, 0, NULL, NULL,
       'cash', 'dividend', 'USD', now(), now()
     FROM the_account t, sec_aapl s`,
  )
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
