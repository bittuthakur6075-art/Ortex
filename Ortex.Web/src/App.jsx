import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
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
