import { readFile } from 'node:fs/promises'

// The e2e backend's console mailer prints every message to stdout, which
// `just e2e-backend` tees into test-results/backend.log. Delivery IS the
// log — these helpers fish the tokened links back out of it.

const LOG_PATH = new URL('../../test-results/backend.log', import.meta.url)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function tokenFor(email: string, linkPath: string): Promise<string> {
  // Match within a single mail block (delimited by the trailing `===`), so a
  // near-miss can never bleed into the next mail and steal its token.
  const block = new RegExp(
    `=== mail to ${escapeRegExp(email)} — [^\\n]*===\\n([^]*?)\\n===`,
    'g',
  )
  const link = new RegExp(`${linkPath}\\?token=([A-Za-z0-9_-]+)`)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const log = await readFile(LOG_PATH, 'utf8').catch(() => '')
    const bodies = [...log.matchAll(block)].map((match) => match[1])
    const tokens = bodies
      .map((body) => body.match(link)?.[1])
      .filter((token): token is string => token !== undefined)
    const last = tokens.at(-1)
    if (last) return last
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`no ${linkPath} mail for ${email} in backend.log`)
}

/** The latest email-verification token mailed to `email`. */
export function verificationTokenFor(email: string): Promise<string> {
  return tokenFor(email, '/verify-email')
}

/** The latest password-reset token mailed to `email` (CP2). */
export function resetTokenFor(email: string): Promise<string> {
  return tokenFor(email, '/reset-password')
}
