import { expect, test } from '@playwright/test'
import { PASSWORD, seedUser, uniqueEmail } from './helpers/api'
import { loginViaUi } from './helpers/ui'

// Paint-level probe: computed style can lie when Safari's compositor holds
// a stale layer. Screenshot the button region after leaving and check
// whether icon pixels are actually painted.
test('probe: pixels after a long hover ends', async ({ page }) => {
  const email = uniqueEmail('paint-probe')
  await seedUser(email, PASSWORD, [
    { kind: 'depository', label: 'Alpha', currency: 'USD', balanceMinor: 1000 },
    { kind: 'depository', label: 'Beta', currency: 'USD', balanceMinor: 2000 },
  ])
  await loginViaUi(page, email, PASSWORD)
  await expect(page).toHaveURL(/\/accounts$/)

  const row = page.getByTestId('account-card').filter({ hasText: 'Alpha' })
  const button = row.getByRole('button', { name: 'Archive Alpha' })

  await row.hover()
  await page.waitForTimeout(1500)
  const box = await button.boundingBox()
  if (!box) throw new Error('no box')

  await page.mouse.move(5, 5)
  await page.waitForTimeout(800)

  const shot = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  })
  // Decode PNG via the browser context (no node deps): count pixels that
  // differ from the row's background.
  const distinct = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    const colors = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    }
    return colors.size
  }, shot.toString('base64'))
  console.log('distinct colors in button region after leave:', distinct)
  // A blank card region is 1-3 shades (bg + border AA); a painted icon
  // brings many more.
  expect(distinct).toBeLessThan(6)
})
