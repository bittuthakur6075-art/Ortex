import { Suspense, useEffect, useRef, useState } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import { trackPageView } from "./lib/tracker"
import { CONSENT_EVENT, CONSENT_GRANTED } from "./lib/consent"
import { flushOutbox } from "./lib/leads"
import useSmoothScroll from "./hooks/useSmoothScroll"
import { lazyWithRetry } from "./lib/lazyWithRetry"
import RouteErrorBoundary from "./components/layout/RouteErrorBoundary"

// Below-the-fold, non-critical UI: defer out of the initial bundle so it does
// not block first paint / Core Web Vitals.
const LiveOrty = lazyWithRetry(() => import("./components/ui/LiveOrty"), { reload: false })
const CookieConsent = lazyWithRetry(() => import("./components/ui/CookieConsent"), { reload: false })

// Lazy load pages to optimize bundle size and core web vitals
const Home = lazyWithRetry(() => import("./pages/Home"))
const About = lazyWithRetry(() => import("./pages/About"))
const Products = lazyWithRetry(() => import("./pages/Products"))
const ProductCategory = lazyWithRetry(() => import("./pages/ProductCategory"))
const ProductDetail = lazyWithRetry(() => import("./pages/ProductDetail"))
const Industries = lazyWithRetry(() => import("./pages/Industries"))
const Work = lazyWithRetry(() => import("./pages/Work"))
const OEM = lazyWithRetry(() => import("./pages/OEM"))
const Contact = lazyWithRetry(() => import("./pages/Contact"))
const Privacy = lazyWithRetry(() => import("./pages/Privacy"))
const Terms = lazyWithRetry(() => import("./pages/Terms"))
const Cookies = lazyWithRetry(() => import("./pages/Cookies"))
const AcceptableUse = lazyWithRetry(() => import("./pages/AcceptableUse"))
const QuoteCalculator = lazyWithRetry(() => import("./pages/QuoteCalculator"))
const FAQ = lazyWithRetry(() => import("./pages/FAQ"))
const NotFound = lazyWithRetry(() => import("./pages/NotFound"))

export function AppLayout() {
  const location = useLocation()

  // The floating widgets (Anu, cookie banner) are browser-only: they read
  // sessionStorage, open the mic and time themselves from page load. They mount
  // after hydration so the prerendered HTML and the first client render agree,
  // and a crawler never reads a call panel as page content. They also wait for
  // the page to finish loading and the browser to go idle: Anu's chunk is
  // ~450 KB, and fetching it alongside the page pushed back first paint and
  // interactivity on a phone.
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

  // Lenis momentum scrolling for the whole app.
  useSmoothScroll()

  // Deliver any enquiry that couldn't reach the backend when it was submitted.
  useEffect(() => {
    flushOutbox()
    window.addEventListener("online", flushOutbox)
    return () => window.removeEventListener("online", flushOutbox)
  }, [])

  // One row per visit the person actually made: the label, the page name and
  // any search or product in the query string are all derived in tracker.js.
  // Keyed on the pathname: a page rewriting its own query string (Products'
  // search and filters) is the same visit. Nothing is recorded without
  // analytics consent; accepting records the page the visitor is on.
  const { pathname, search } = location
  const searchRef = useRef(search)
  searchRef.current = search
  useEffect(() => {
    trackPageView({ pathname, search: searchRef.current })
  }, [pathname])
  useEffect(() => {
    const onConsent = (e) => {
      if (e.detail === CONSENT_GRANTED) trackPageView({ pathname: window.location.pathname, search: window.location.search, afterConsent: true })
    }
    window.addEventListener(CONSENT_EVENT, onConsent)
    return () => window.removeEventListener(CONSENT_EVENT, onConsent)
  }, [])

  return (
    <>
      <ScrollToTop />
      <div className="flex flex-col min-h-screen bg-background text-foreground">

        {/* Skip to content for keyboard users */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:font-semibold"
        >
          Skip to content
        </a>

        {/* Navigation Bar */}
        <Navbar />

        {/* Page Content */}
        <main id="main" className="flex-grow">
          <RouteErrorBoundary key={pathname}>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            }>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/products" element={<Products />} />
                <Route path="/products/:slug" element={<ProductCategory />} />
                <Route path="/products/:slug/:productSlug" element={<ProductDetail />} />
                <Route path="/industries" element={<Industries />} />
                <Route path="/oem" element={<OEM />} />
                <Route path="/work" element={<Work />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/acceptable-use" element={<AcceptableUse />} />
                <Route path="/quote" element={<QuoteCalculator />} />
                <Route path="/faq" element={<FAQ />} />

                {/* /portfolio, /photos and /gallery all merged into /work. All are
                    indexed, so they redirect rather than 404. Remove once Search
                    Console shows no impressions on the old paths. */}
                <Route path="/portfolio" element={<Navigate to="/work" replace />} />
                <Route path="/photos" element={<Navigate to="/work" replace />} />
                <Route path="/gallery" element={<Navigate to="/work" replace />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </main>

        {/* Footer */}
        <Footer />

        {/* Deferred, non-critical floating UI */}
        {mounted && (
          <RouteErrorBoundary silent>
            <Suspense fallback={null}>
              {/* Live voice assistant (Gemini Live API) */}
              <LiveOrty />
              {/* Analytics consent banner */}
              <CookieConsent />
            </Suspense>
          </RouteErrorBoundary>
        )}

        {/* Sonner Toaster for Notifications */}
        <Toaster position="top-right" richColors />

      </div>
    </>
  )
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  )
}

export default App

