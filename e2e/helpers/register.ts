import type { APIRequestContext } from '@playwright/test'
import { authedContext } from './api'

// Register seeding, straight through the real API (the accounts pattern):
// manual accounts accept POST /transactions, so a spec stages exactly the
// ledger it needs — categories, tags, splits, transfers, review states —
// without touching Plaid.
//
// Review-state physics (backend create_transaction): a manual transaction
// created WITH a category or tags is decided — reviewed at birth. Created
// bare, it stays unreviewed. Specs lean on that to stage both states.

type Csrf = () => Promise<Record<string, string>>

async function post<T>(
  ctx: APIRequestContext,
  csrf: Csrf,
  url: string,
  data: unknown,
): Promise<T> {
  const response = await ctx.post(url, { data, headers: await csrf() })
  if (!response.ok()) {
    throw new Error(
      `seed POST ${url} failed: ${response.status()} ${await response.text()}`,
    )
  }
  return (await response.json()) as T
}

export interface SeedTxn {
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** Signed integer minor units — negative is money out. */
  amountMinor: number
  description: string
  /** Category NAME (resolved/created through the seeder). */
  category?: string
  tags?: string[]
  displayName?: string
  notes?: string
}

export class RegisterSeeder {
  private readonly ctx: APIRequestContext
  private readonly csrf: Csrf
  private readonly categoryIds = new Map<string, string>()

  private constructor(ctx: APIRequestContext, csrf: Csrf) {
    this.ctx = ctx
    this.csrf = csrf
  }

  static async login(email: string, password: string) {
    const { ctx, csrf } = await authedContext(email, password)
    return new RegisterSeeder(ctx, csrf)
  }

  async dispose() {
    await this.ctx.dispose()
  }

  async createAccount(
    label: string,
    kind: 'depository' | 'credit' = 'depository',
  ): Promise<string> {
    const account = await post<{ id: string }>(
      this.ctx,
      this.csrf,
      '/api/v1/accounts',
      { kind, label, currency: 'USD' },
    )
    return account.id
  }

  async categoryId(name: string): Promise<string> {
    const existing = this.categoryIds.get(name)
    if (existing) return existing
    // Signup seeds a default taxonomy, and the backend enforces unique
    // sibling names — reuse a same-named category instead of tripping it.
    const listed = await this.listCategories()
    const match = listed.find((c) => c.name === name)
    if (match) {
      this.categoryIds.set(name, match.id)
      return match.id
    }
    const category = await post<{ id: string }>(
      this.ctx,
      this.csrf,
      '/api/v1/categories',
      { name },
    )
    this.categoryIds.set(name, category.id)
    return category.id
  }

  private async listCategories(): Promise<{ id: string; name: string }[]> {
    const items: { id: string; name: string }[] = []
    let cursor: string | null = null
    do {
      const url: string = cursor
        ? `/api/v1/categories?cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/categories'
      const response = await this.ctx.get(url)
      if (!response.ok()) {
        throw new Error(`seed GET ${url} failed: ${response.status()}`)
      }
      const page = (await response.json()) as {
        items: { id: string; name: string }[]
        next_cursor: string | null
      }
      items.push(...page.items)
      cursor = page.next_cursor
    } while (cursor)
    return items
  }

  async createTxn(accountId: string, txn: SeedTxn): Promise<string> {
    const created = await post<{ id: string }>(
      this.ctx,
      this.csrf,
      '/api/v1/transactions',
      {
        account_id: accountId,
        date: txn.date,
        amount_minor: txn.amountMinor,
        description: txn.description,
        category_id: txn.category ? await this.categoryId(txn.category) : null,
        tags: txn.tags ?? null,
        display_name: txn.displayName ?? null,
        notes: txn.notes ?? null,
      },
    )
    return created.id
  }

  /** Link two transactions (opposite legs) into a transfer. */
  async createTransfer(outflowId: string, inflowId: string): Promise<void> {
    await post(this.ctx, this.csrf, '/api/v1/transfers', {
      transaction_ids: [outflowId, inflowId],
    })
  }

  /** Replace a transaction's split lines (amounts must sum to the parent). */
  async putSplits(
    txnId: string,
    lines: Array<{ amountMinor: number; category?: string; memo?: string }>,
  ): Promise<void> {
    const body = []
    for (const line of lines) {
      body.push({
        amount_minor: line.amountMinor,
        category_id: line.category
          ? await this.categoryId(line.category)
          : null,
        memo: line.memo ?? null,
      })
    }
    const response = await this.ctx.put(
      `/api/v1/transactions/${txnId}/splits`,
      { data: body, headers: await this.csrf() },
    )
    if (!response.ok()) {
      throw new Error(
        `seed splits failed: ${response.status()} ${await response.text()}`,
      )
    }
  }
}

/** Local-time ISO date `days` back from today — specs stage recent history
 * relative to the run date, so rolling presets ("Last 90 days") stay true. */
export function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The Register's group-header voice for a date seeded via daysAgo. */
export function dayHeading(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: 'numeric' }
      : {}),
  })
}
