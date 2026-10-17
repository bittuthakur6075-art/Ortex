import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import { flushOutbox } from "./lib/leads"
import useSmoothScroll from "./hooks/useSmoothScroll"

// Pages are lazy so each URL downloads only its own code. A new route needs an
// entry in scripts/routes-meta.mjs too, or it is never prerendered.
const Home = lazy(() => import("./pages/Home"))
const About = lazy(() => import("./pages/About"))
const Products = lazy(() => import("./pages/Products"))
const Industries = lazy(() => import("./pages/Industries"))
const Portfolio = lazy(() => import("./pages/Portfolio"))
const Contact = lazy(() => import("./pages/Contact"))
const Privacy = lazy(() => import("./pages/Privacy"))
const Terms = lazy(() => import("./pages/Terms"))
const NotFound = lazy(() => import("./pages/NotFound"))
// Anu, the voice assistant: the same files as Ortex.Web (components/ui/live-orty,
// kept identical by scripts/check-anu-mirror.mjs).
const LiveOrty = lazy(() => import("./components/ui/LiveOrty"))

export function AppLayout() {
  useSmoothScroll()

  // Anu is browser-only: mounted after load and an idle moment, never during
  // the prerender, so the server and client markup match and her ~450 KB
  // chunk never competes with first paint (same rule as Ortex.Web/App.jsx).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let idleId = null
    let timer = null
    const mount = () => setMounted(true)
    const start = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(mount, { timeout: 2500 })
      else timer = window.setTimeout(mount, 1200)
    }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
    return () => {
      window.removeEventListener("load", start)
      if (idleId !== null) window.cancelIdleCallback(idleId)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  // Deliver any enquiry that could not reach the backend when it was sent.
  useEffect(() => {
    flushOutbox()
    window.addEventListener("online", flushOutbox)
    return () => window.removeEventListener("online", flushOutbox)
  }, [])

  return (
    <>
      <ScrollToTop />
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:font-semibold"
        >
          Skip to content
        </a>

        <Navbar />

        <main id="main" className="flex-grow">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/products" element={<Products />} />
              <Route path="/industries" element={<Industries />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>

        <Footer />

        {mounted && (
          <Suspense fallback={null}>
            <LiveOrty />
          </Suspense>
        )}

        <Toaster position="top-right" richColors />
      </div>
    </>
  )
}

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  )
}
