import { readFile } from 'node:fs/promises'

// Provider credentials for the suite's non-hermetic edges (Plaid sandbox,
// MX integration): the backend's .env.local locally (the PINCH_ENV=local
// file the e2e recipes pin — see pinch-backend#94), process env in CI.
// The file wins over process env deliberately: a developer shell that
// inherited production exports (e.g. via `just claude`'s dotenv-load) once
// hijacked seeding with production creds; CI has no file, so it still
// reads its pinned sandbox secrets from the environment.

/** Strip optional quotes and trailing comments from a dotenv value. */
export function dotenvValue(env: string, key: string): string | undefined {
  const raw = env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
  if (!raw) return undefined
  const unquoted = raw.match(/^"([^"]*)"|^'([^']*)'/)
  if (unquoted) return unquoted[1] ?? unquoted[2]
  return raw.split(/\s+#/)[0].trim() || undefined
}

/** The e2e backend checkout's .env.local contents ('' when absent).
 * Falls back to the retired bare .env for pre-#94 backend checkouts. */
export async function backendDotenv(): Promise<string> {
  const backendDir =
    process.env.E2E_BACKEND_DIR ??
    new URL('../../../pinch-backend', import.meta.url).pathname
  const local = await readFile(`${backendDir}/.env.local`, 'utf8').catch(
    () => '',
  )
  if (local) return local
  return readFile(`${backendDir}/.env`, 'utf8').catch(() => '')
}
