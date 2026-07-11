import { useEffect } from "react"
import Lenis from "lenis"

/**
 * Momentum/inertia smooth scrolling, the Lenis-based foundation the
 * onething.design reference rides on. A single instance is kept at module scope
 * so route-change scroll resets (ScrollToTop) can jump it to the top instantly
 * via getLenis() instead of fighting the animated scroll.
 */
let lenisInstance = null
export const getLenis = () => lenisInstance

export default function useSmoothScroll() {
  useEffect(() => {
    // Never hijack scrolling for users who asked the OS for reduced motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
      smoothWheel: true,
    })
    lenisInstance = lenis

    let rafId
    const raf = (time) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisInstance = null
    }
  }, [])
}
