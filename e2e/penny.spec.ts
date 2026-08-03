import { expect, test } from '@playwright/test'
import { authedContext, PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { contrastRatio } from './helpers/contrast'
import { loginViaUi, toggleTheme } from './helpers/ui'

// F6 CP0 (issue #46): the integration spike's definition of done. The e2e
// backend runs pydantic-ai's deterministic `test` model — no key, no mock,
// the real wire. That model calls every registered tool once per turn, so
// one user message yields read-tool activity plus one approval request per
// write tool, and the assistant's text arrives only on the follow-up turn,
// after EVERY approval is answered (the backend rejects partial verdicts;
// the SDK's sendAutomaticallyWhen resubmits once all are in).

test('CP1: the s22 screen — chips seed the first ask, the URL takes the conversation id, reload restores the transcript', async ({
  page,
}) => {
  const email = uniqueEmail('penny-cp1')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/penny')
  await expect(page.getByRole('heading', { name: 'Penny' })).toBeVisible()

  // Empty conversation: exactly three suggestion chips, each an honest map
  // to a real read tool. Clicking one sends it as the first message.
  const chips = page.getByTestId('suggestion-chip')
  await expect(chips).toHaveCount(3)
  await chips.first().click()
  await expect(page.getByTestId('user-text')).toBeVisible()
  await expect(page.getByTestId('suggestion-chip')).toHaveCount(0)

  // First send hands the conversation its URL (history.replace, so Back
  // doesn't step through a dead /penny).
  await expect(page).toHaveURL(/\/penny\/[0-9a-f-]{36}$/)

  // Tool chips are collapsed traces; expanding one reveals the raw call.
  const firstChip = page.getByTestId('tool-part').first()
  await expect(firstChip).toBeVisible({ timeout: 30_000 })
  await firstChip.getByRole('button').click()
  await expect(firstChip.getByTestId('tool-raw')).toBeVisible()

  // Settle the turn (deny everything) so the transcript persists.
  await expect(page.getByTestId('approval-requested')).toHaveCount(5, {
    timeout: 30_000,
  })
  for (const tool of [
    'create_category',
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

  // Reload: the per-Conversation URL hydrates the full transcript from the
  // server — prose, tool chips, resolved approvals.
  await page.reload()
  await expect(page.getByTestId('user-text')).toBeVisible()
  await expect(page.getByTestId('assistant-text').last()).not.toBeEmpty()
  await expect(page.getByTestId('tool-part').first()).toBeVisible()
  // No approval is re-actionable after reload — the verdicts are history.
  await expect(page.getByTestId('approval-requested')).toHaveCount(0)

  // Both registers hold AA on the conversation's own surfaces.
  async function assertContrast() {
    for (const locator of [
      page.getByTestId('user-text'),
      page.getByTestId('assistant-text').last(),
      page.getByTestId('tool-part').first().getByRole('button'),
    ]) {
      expect(await contrastRatio(locator)).toBeGreaterThanOrEqual(4.5)
    }
  }
  await assertContrast()
  await toggleTheme(page)
  await assertContrast()
})

test('CP3: history — switch between Conversations, delete the current one, the survivor restores', async ({
  page,
}) => {
  const email = uniqueEmail('penny-cp3')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  // Conversation A: persisted once the first turn's stream settles (the
  // approval requests arriving IS the turn settling under the test model).
  await page.goto('/penny')
  const composer = page.getByPlaceholder(/ask penny/i)
  await composer.fill('What are my accounts?')
  await composer.press('Enter')
  await expect(page).toHaveURL(/\/penny\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('approval-requested')).toHaveCount(5, {
    timeout: 30_000,
  })
  const urlA = page.url()

  // New chat is a verb on the Penny screen: back to a fresh composer,
  // nothing created server-side until B's first send.
  await page.getByRole('link', { name: 'New chat' }).click()
  await expect(page).toHaveURL(/\/penny$/)
  await expect(page.getByTestId('suggestion-chip')).toHaveCount(3)
  await composer.fill('How is my net worth?')
  await composer.press('Enter')
  await expect(page.getByTestId('approval-requested')).toHaveCount(5, {
    timeout: 30_000,
  })

  // History: both Conversations, newest first, titled by first message.
  await page.getByRole('button', { name: 'History' }).click()
  const rows = page.getByTestId('history-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('How is my net worth?')
  await expect(rows.last()).toContainText('What are my accounts?')

  // Switching restores A — same URL, same transcript.
  await rows.last().click()
  await expect(page).toHaveURL(urlA)
  await expect(page.getByTestId('user-text').first()).toHaveText(
    'What are my accounts?',
  )

  // Deleting the CURRENT Conversation asks first, then lands on a fresh
  // chat with A gone from history.
  await page.getByRole('button', { name: 'History' }).click()
  await page
    .getByRole('button', {
      name: 'Delete conversation: What are my accounts?',
    })
    .click()
  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await expect(page).toHaveURL(/\/penny$/)

  // The survivor restores fully after a reload.
  await page.reload()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByTestId('history-row')).toHaveCount(1)
  await page.getByTestId('history-row').first().click()
  await expect(page).toHaveURL(/\/penny\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('user-text').first()).toHaveText(
    'How is my net worth?',
  )
  await expect(page.getByTestId('tool-part').first()).toBeVisible()
})

test('CP4: approving a write invalidates ledger-scoped queries wholesale, denying changes nothing, reload mid-approval renders expired', async ({
  page,
}) => {
  const email = uniqueEmail('penny-cp4')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  await page.goto('/penny')
  const composer = page.getByPlaceholder(/ask penny/i)
  await composer.fill('Set things up')
  await composer.press('Enter')
  await expect(page.getByTestId('approval-requested')).toHaveCount(5, {
    timeout: 30_000,
  })

  // Blanket invalidation (PRD #45 decision 9): the approved write is
  // create_category, which changes no unreviewed-count VALUE — the proof
  // is that the shell's always-mounted InboxCount query gets invalidated
  // and genuinely refetches anyway, because invalidation is wholesale
  // across ledger-scoped families, not a per-tool map that would only
  // know to touch categories.
  const invalidatedInboxCount = page.waitForResponse((response) =>
    response.url().includes('/api/v1/transactions/unreviewed-count'),
  )
  await page.getByTestId('approve-create_category').click()
  for (const tool of [
    'recategorize_transaction',
    'accept_review',
    'create_rule',
    'mark_transfer',
  ]) {
    await page.getByTestId(`deny-${tool}`).click()
  }
  await expect(invalidatedInboxCount).resolves.toBeTruthy()

  // Deny changes nothing on the ledger: no category from any denied tool's
  // garbage input exists.
  await expect(page.getByTestId('assistant-text').last()).not.toBeEmpty({
    timeout: 30_000,
  })
  const { ctx } = await authedContext(email, PASSWORD)
  try {
    const categories = (await (await ctx.get('/api/v1/categories')).json()) as {
      items: Array<{ name: string }>
    }
    expect(categories.items.filter((c) => c.name === 'a')).toHaveLength(1)
  } finally {
    await ctx.dispose()
  }

  // A second, fresh Conversation: send, leave every approval unanswered,
  // and reload before deciding anything — the realistic "walked away"
  // case. The backend holds no durable pending queue (CONTEXT.md:
  // Approval card), so this reload is the ground truth for "expired".
  await page.goto('/penny')
  await composer.fill('Ask again')
  await composer.press('Enter')
  await expect(page.getByTestId('approval-requested')).toHaveCount(5, {
    timeout: 30_000,
  })
  await page.reload()
  await expect(page.getByTestId('approval-expired')).toHaveCount(5)
  await expect(page.getByTestId('approval-requested')).toHaveCount(0)
  for (const tool of [
    'recategorize_transaction',
    'accept_review',
    'create_rule',
    'mark_transfer',
    'create_category',
  ]) {
    await expect(
      page.getByTestId(`approve-${tool}`),
      `${tool} must not be re-clickable after expiry`,
    ).toHaveCount(0)
  }
})

test('a dropped stream surfaces the error and Try again resumes the turn', async ({
  page,
}) => {
  const email = uniqueEmail('penny-err')
  await seedUser(email, PASSWORD)
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto('/penny')

  // The network eats the chat request: the error is visible, the message
  // is not silently lost.
  await page.route('**/api/v1/penny/chat', (route) => route.abort())
  const composer = page.getByPlaceholder(/ask penny/i)
  await composer.fill('What did I spend this month?')
  await composer.press('Enter')
  await expect(page.getByTestId('user-text')).toBeVisible()
  await expect(page.getByTestId('chat-error')).toBeVisible({
    timeout: 15_000,
  })

  // Connectivity returns; Try again resumes the same turn for real.
  await page.unroute('**/api/v1/penny/chat')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('tool-part').first()).toBeVisible({
    timeout: 30_000,
  })
})

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
