import type { Locator } from '@playwright/test'

/** WCAG 2.x contrast ratio of an element's text against its effective
 * background, computed in-page. Ancestor backgrounds are composited
 * bottom-up on a 1×1 canvas — the canvas normalizes any computed color
 * (including `color-mix()` tints) to sRGB bytes, and source-over
 * compositing resolves the alpha stack the way the screen does. */
export async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx === null) throw new Error('no 2d canvas context')
    const paint = (color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
    }
    const pixel = (): [number, number, number] => {
      const { data } = ctx.getImageData(0, 0, 1, 1)
      return [data[0], data[1], data[2]]
    }

    // Effective background: every ancestor's background-color, painted
    // root-first so semi-transparent tints land on their real surface.
    const chain: string[] = []
    for (let node: Element | null = element; node; node = node.parentElement) {
      chain.push(getComputedStyle(node).backgroundColor)
    }
    paint('#fff') // canvas fallback below a fully transparent stack
    for (const color of chain.reverse()) paint(color)
    const background = pixel()
    paint(getComputedStyle(element).color)
    const foreground = pixel()

    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (v: number) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const bg = luminance(background)
    const fg = luminance(foreground)
    const [hi, lo] = bg > fg ? [bg, fg] : [fg, bg]
    return (hi + 0.05) / (lo + 0.05)
  })
}
