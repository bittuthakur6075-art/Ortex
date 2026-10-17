import { lazy, Suspense, useEffect } from "react"
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

export function AppLayout() {
  useSmoothScroll()

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
