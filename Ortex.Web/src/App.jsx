import { lazy, Suspense, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import Chatbot from "./components/ui/Chatbot"
import WhatsAppWidget from "./components/ui/WhatsAppWidget"
import CookieConsent from "./components/ui/CookieConsent"
import { trackActivity } from "./lib/tracker"
import { flushOutbox } from "./lib/leads"

// Lazy load pages to optimize bundle size and core web vitals
const Home = lazy(() => import("./pages/Home"))
const About = lazy(() => import("./pages/About"))
const Products = lazy(() => import("./pages/Products"))
const ProductCategory = lazy(() => import("./pages/ProductCategory"))
const Industries = lazy(() => import("./pages/Industries"))
const Work = lazy(() => import("./pages/Work"))
const OEM = lazy(() => import("./pages/OEM"))
const Contact = lazy(() => import("./pages/Contact"))
const Privacy = lazy(() => import("./pages/Privacy"))
const Terms = lazy(() => import("./pages/Terms"))
const Cookies = lazy(() => import("./pages/Cookies"))
const AcceptableUse = lazy(() => import("./pages/AcceptableUse"))
const QuoteCalculator = lazy(() => import("./pages/QuoteCalculator"))
const FAQ = lazy(() => import("./pages/FAQ"))
const NotFound = lazy(() => import("./pages/NotFound"))

function AppLayout() {
  const location = useLocation()

  // Deliver any enquiry that couldn't reach the backend when it was submitted.
  useEffect(() => {
    flushOutbox()
    window.addEventListener("online", flushOutbox)
    return () => window.removeEventListener("online", flushOutbox)
  }, [])

  useEffect(() => {
    let activityType = "Home page visit"
    const path = location.pathname

    if (path === "/") {
      activityType = "Home page visit"
    } else if (path === "/products") {
      activityType = "Product page visit"
    } else if (path === "/about") {
      activityType = "Category browsing"
    } else if (path === "/quote") {
      activityType = "Checkout"
    } else if (path === "/contact") {
      activityType = "Product inquiry"
    } else if (path === "/privacy" || path === "/terms" || path === "/cookies" || path === "/acceptable-use") {
      activityType = "File download"
    } else {
      activityType = "Category browsing"
    }

    const params = new URLSearchParams(location.search)
    const searchVal = params.get("search") || params.get("q")
    const productVal = params.get("product")

    let metadata = {}
    if (searchVal) {
      metadata.searchQuery = searchVal
      trackActivity({ activityType: "Product search", metadata })
    }

    if (productVal) {
      metadata.productName = productVal
      trackActivity({ activityType: "Product page visit", productId: productVal, metadata })
    } else {
      trackActivity({ activityType, metadata })
    }
  }, [location])

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

              {/* /portfolio and /photos merged into /work. Both are indexed, so
                  they redirect rather than 404. Remove once Search Console shows
                  no impressions on the old paths. */}
              <Route path="/portfolio" element={<Navigate to="/work" replace />} />
              <Route path="/photos" element={<Navigate to="/work" replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>

        {/* Footer */}
        <Footer />
        {/* Ortex AI Chatbot Guide */}
        <Chatbot />
        {/* Floating WhatsApp Widget */}
        <WhatsAppWidget />
        {/* Consent gate for IP-geolocation analytics */}
        <CookieConsent />

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

