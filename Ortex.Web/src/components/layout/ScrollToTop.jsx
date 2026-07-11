import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { getLenis } from "../../hooks/useSmoothScroll"

export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Jump instantly on route change; Lenis owns the scroll position when active.
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname])

  return null
}
