import { useEffect, useLayoutEffect } from "react"
import { useLocation } from "react-router-dom"
import { getLenis } from "../../hooks/useSmoothScroll"

// This component is prerendered too (entry-server.jsx). A layout effect has no
// meaning on the server, so fall back to useEffect there rather than have React
// warn about it 213 times during the build.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

// How long to keep asserting the top of the page after a route change. Pages
// are lazy chunks (App.jsx), so the document is still the short Suspense
// fallback when the route changes and only grows to full height once the chunk
// lands; the offset has to be re-asserted across that window, not just once.
const SETTLE_MS = 700

/**
 * Every route change starts at the top of the new page.
 *
 * A single scrollTo on the route change was not enough, and a product opened
 * from the catalogue grid landed at its footer:
 *
 *  1. Lenis animates the wheel. Clicking a card part-way through that animation
 *     left an in-flight tween still running toward the OLD page's offset, which
 *     it then applied to the new page. `stop()` before the jump cancels it, and
 *     `force` lets the jump through while Lenis is stopped.
 *  2. Lenis caches the document height. After a route change that cache is the
 *     previous page's, so `resize()` makes it re-measure.
 *  3. The page itself arrives late (lazy chunk). The browser clamps the old
 *     offset to the short fallback's height, then the real page mounts and the
 *     offset can come back. Hence the re-assert loop below.
 *
 * The loop gives up the moment the visitor scrolls for themselves, so it can
 * never fight someone who has started reading.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useBeforePaint(() => {
    let frame = null
    let stopped = false
    const started = performance.now()

    // Each frame only reads two numbers; the actual jump runs on the first
    // frame, whenever the document height changes (the chunk landing, images
    // sizing) and whenever something has moved the offset off the top. Calling
    // resize() every frame would force a layout during the page transition.
    let lastHeight = -1
    const jump = (first) => {
      const height = document.documentElement.scrollHeight
      const grew = height !== lastHeight
      lastHeight = height
      if (!first && !grew && window.scrollY === 0) return

      const lenis = getLenis()
      if (lenis) {
        lenis.stop()
        if (grew) lenis.resize()
        lenis.scrollTo(0, { immediate: true, force: true })
        lenis.start()
      }
      window.scrollTo(0, 0)
    }

    const release = () => {
      if (stopped) return
      stopped = true
      if (frame !== null) cancelAnimationFrame(frame)
      for (const evt of ["wheel", "touchstart", "keydown"]) {
        window.removeEventListener(evt, release)
      }
    }

    const tick = (first) => {
      if (stopped) return
      jump(first)
      if (performance.now() - started >= SETTLE_MS) return release()
      frame = requestAnimationFrame(() => tick(false))
    }

    for (const evt of ["wheel", "touchstart", "keydown"]) {
      window.addEventListener(evt, release, { passive: true })
    }
    tick(true)

    return release
  }, [pathname])

  return null
}
