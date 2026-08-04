import { readFile } from 'node:fs/promises'

// Provider credentials for the suite's non-hermetic edges (Plaid sandbox,
// MX integration): process env in CI, the backend's .env locally.

/** Strip optional quotes and trailing comments from a dotenv value. */
export function dotenvValue(env: string, key: string): string | undefined {
  const raw = env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
  if (!raw) return undefined
  const unquoted = raw.match(/^"([^"]*)"|^'([^']*)'/)
  if (unquoted) return unquoted[1] ?? unquoted[2]
  return raw.split(/\s+#/)[0].trim() || undefined
}

/** The e2e backend checkout's .env contents ('' when absent). */
export async function backendDotenv(): Promise<string> {
  const backendDir =
    process.env.E2E_BACKEND_DIR ??
    new URL('../../../pinch-backend', import.meta.url).pathname
  return readFile(`${backendDir}/.env`, 'utf8').catch(() => '')
}
