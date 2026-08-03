import { useEffect, useRef, useState } from 'react'

// Hover-revealed row verbs, driven by pointer events instead of CSS :hover:
// real-input Safari can swallow the leave signal entirely (fast exits,
// window-edge departures, ~1s dwells before a decisive flick), pinning the
// revealed state — unreproducible with synthetic input, very real on a
// trackpad. So no single signal is trusted:
// - pointerenter/pointerleave are the primary reveal/clear pair;
// - while revealed, a document-level pointermove watchdog clears the
//   moment the cursor moves anywhere outside the row — a missed leave
//   event can no longer be OBSERVED, because any subsequent movement
//   corrects it;
// - window blur is the failsafe for app switches mid-hover.
// Keyboard visibility stays CSS (`has-[:focus-visible]` / `focus-visible`)
// — this hook only owns the pointer half.
export function useHoverReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!hovered) return
    const clear = () => setHovered(false)
    const onMove = (event: PointerEvent) => {
      const row = ref.current
      if (
        row === null ||
        !(event.target instanceof Node) ||
        !row.contains(event.target)
      ) {
        clear()
      }
    }
    window.addEventListener('blur', clear)
    document.addEventListener('pointermove', onMove, true)
    return () => {
      window.removeEventListener('blur', clear)
      document.removeEventListener('pointermove', onMove, true)
    }
  }, [hovered])
  return {
    ref,
    hovered,
    bind: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
    },
  }
}
