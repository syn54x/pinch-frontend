import { useEffect, useState } from 'react'

// Hover-revealed row verbs, driven by pointer events instead of CSS :hover:
// Safari can fail to clear :hover when the cursor exits the window quickly
// (no further mousemove lands in the page), pinning "revealed" state until
// the pointer returns. pointerleave fires reliably on DOM exit, and the
// window-blur listener is the failsafe for app switches mid-hover.
// Keyboard visibility stays CSS (`has-[:focus-visible]` / `focus-visible`)
// — this hook only owns the pointer half.
export function useHoverReveal() {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!hovered) return
    const clear = () => setHovered(false)
    window.addEventListener('blur', clear)
    return () => window.removeEventListener('blur', clear)
  }, [hovered])
  return {
    hovered,
    bind: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
    },
  }
}
