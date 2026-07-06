import { lazy, Suspense } from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import Chatbot from "./components/ui/Chatbot"
import WhatsAppWidget from "./components/ui/WhatsAppWidget"

// Lazy load pages to optimize bundle size and core web vitals
const Home = lazy(() => import("./pages/Home"))
const About = lazy(() => import("./pages/About"))
const Products = lazy(() => import("./pages/Products"))
const Industries = lazy(() => import("./pages/Industries"))
const Portfolio = lazy(() => import("./pages/Portfolio"))
const Contact = lazy(() => import("./pages/Contact"))
const Privacy = lazy(() => import("./pages/Privacy"))
const Terms = lazy(() => import("./pages/Terms"))
const Cookies = lazy(() => import("./pages/Cookies"))
const AcceptableUse = lazy(() => import("./pages/AcceptableUse"))
const QuoteCalculator = lazy(() => import("./pages/QuoteCalculator"))
const FAQ = lazy(() => import("./pages/FAQ"))
const Photos = lazy(() => import("./pages/Photos"))
const NotFound = lazy(() => import("./pages/NotFound"))

function AppLayout() {

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
          </Suspense>
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

