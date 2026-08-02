import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// F6 CP0 (issue #46): the integration spike's definition of done. The e2e
// backend runs pydantic-ai's deterministic `test` model — no key, no mock,
// the real wire. That model calls every registered tool once per turn, so
// one user message yields read-tool activity plus one approval request per
// write tool, and the assistant's text arrives only on the follow-up turn,
// after EVERY approval is answered (the backend rejects partial verdicts;
// the SDK's sendAutomaticallyWhen resubmits once all are in).

test('a message streams tool activity, pauses on approvals, resumes on verdicts, and persists', async ({
  page,
}) => {
  const email = uniqueEmail('penny-cp0')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/penny')
  await expect(page.getByRole('heading', { name: 'Penny' })).toBeVisible()

  const prompt = 'Recategorize my latest Starbucks transaction to Dining'
  const composer = page.getByPlaceholder(/ask penny/i)
  await composer.fill(prompt)
  await composer.press('Enter')

  // The user turn renders immediately.
  await expect(page.getByText(prompt)).toBeVisible()

  // Turn 1 under the test model: reads complete, the five writes pause the
  // stream on approval — and no assistant text yet.
  await expect(page.getByTestId('tool-part')).toHaveCount(15, {
    timeout: 30_000,
  })
  const approvals = page.getByTestId('approval-requested')
  await expect(approvals).toHaveCount(5)

  // Answer every approval: one real write approved, the rest denied. The
  // SDK auto-resubmits the verdict turn; text streams only after that.
  await page.getByTestId('approve-create_category').click()
  for (const tool of [
    'recategorize_transaction',
    'accept_review',
    'create_rule',
    'mark_transfer',
  ]) {
    await page.getByTestId(`deny-${tool}`).click()
  }
  await expect(page.getByTestId('assistant-text').last()).not.toBeEmpty({
    timeout: 30_000,
  })

  // The approved write took real effect: the test model's create_category
  // input is {"name": "a"} — the category now exists on the ledger.
  const { ctx } = await authedContext(email, PASSWORD)
  try {
    const categories = (await (await ctx.get('/api/v1/categories')).json()) as {
      items: Array<{ name: string }>
    }
    expect(categories.items.map((c) => c.name)).toContain('a')

    // And the Conversation persisted server-side, titled by the first
    // user message.
    const conversations = (await (
      await ctx.get('/api/v1/penny/conversations')
    ).json()) as { items: Array<{ title: string }> }
    expect(conversations.items.map((c) => c.title)).toContain(prompt)
  } finally {
    await ctx.dispose()
  }
})
