import { useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import Chatbot from "./components/ui/Chatbot"
import WhatsAppWidget from "./components/ui/WhatsAppWidget"
import Home from "./pages/Home"
import About from "./pages/About"
import Products from "./pages/Products"
import Industries from "./pages/Industries"
import Portfolio from "./pages/Portfolio"
import Contact from "./pages/Contact"
import Privacy from "./pages/Privacy"
import Terms from "./pages/Terms"
import Cookies from "./pages/Cookies"
import AcceptableUse from "./pages/AcceptableUse"
import QuoteCalculator from "./pages/QuoteCalculator"
import FAQ from "./pages/FAQ"
import Photos from "./pages/Photos"
import NotFound from "./pages/NotFound"
import { trackActivity } from "./lib/tracker"

function AppLayout() {
  const location = useLocation()

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
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/products" element={<Products />} />
            <Route path="/industries" element={<Industries />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/acceptable-use" element={<AcceptableUse />} />
            <Route path="/quote" element={<QuoteCalculator />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/photos" element={<Photos />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Footer */}
        <Footer />
        {/* Ortex AI Chatbot Guide */}
        <Chatbot />
        {/* Floating WhatsApp Widget */}
        <WhatsAppWidget />

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
