import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import Navbar from "./components/Navbar"
import Footer from "./components/Footer"
import ScrollToTop from "./components/ScrollToTop"
import Chatbot from "./components/Chatbot"
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

function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        
        {/* Navigation Bar */}
        <Navbar />

        {/* Page Content */}
        <main className="flex-grow">
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
          </Routes>
        </main>

        {/* Footer */}
        <Footer />
        {/* Ortex AI Chatbot Guide */}
        <Chatbot />

        {/* Sonner Toaster for Notifications */}
        <Toaster position="top-right" richColors />
        
      </div>
    </Router>
  )
}


export default App
