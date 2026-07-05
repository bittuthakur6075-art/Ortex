import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X, Sun, Moon } from "lucide-react"
import { whatsappLink } from "../../constants/site"

export default function Navbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") ||
             localStorage.getItem("theme") === "dark" ||
             (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
    }
    return false
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }, [darkMode])

  // Smart-sticky header (ported from Lumex): solidify to a frosted bar once scrolled,
  // tuck out of view on scroll-down and glide back on scroll-up.
  useEffect(() => {
    let lastY = window.scrollY
    const SOLID_AT = 8
    const REVEAL_AT = 120
    const DELTA = 6

    const handleScroll = () => {
      const y = window.scrollY
      setScrolled(y > SOLID_AT)

      if (Math.abs(y - lastY) > DELTA) {
        if (y > lastY && y > REVEAL_AT) {
          setHidden(true)
        } else {
          setHidden(false)
        }
      }
      lastY = y
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  // Auto close mobile menu when switching to desktop view
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Close the mobile overlay whenever the route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const navItems = [
    { name: "Home", path: "/" },
    { name: "About us", path: "/about" },
    { name: "Products & services", path: "/products" },
    { name: "Industries we serve", path: "/industries" },
    { name: "Portfolio", path: "/portfolio" },
    { name: "Contact us", path: "/contact" }
  ]

  const isActive = (path) => location.pathname === path
  const isHome = location.pathname === "/"

  // Transparent over the dark home hero until the user scrolls; frosted otherwise.
  // (Lumex's transparent → frosted-white-blur pattern, adapted to Ortex's theme tokens.)
  const overHero = isHome && !scrolled
  const inkClass = overHero ? "text-white" : "text-foreground"

  return (
    <>
      <header
        id="siteHeader"
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 will-change-transform ${
          hidden && !mobileMenuOpen ? "-translate-y-full" : "translate-y-0"
        } ${
          overHero
            ? "bg-transparent"
            : "bg-background/80 backdrop-blur-md border-b border-border/50"
        }`}
      >
        <div className="lp-wrap">
          <div className="flex h-[70px] items-center justify-between">

            {/* Logo & Branding */}
            <Link to="/" className="flex items-center mr-4 lg:mr-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              <img
                src="/img/logo.svg"
                alt="Ortex Industries"
                className={`h-[42px] w-auto max-w-[220px] object-contain object-left transition-[filter] duration-300 ${
                  overHero ? "brightness-0 invert" : ""
                }`}
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3.5 py-2 text-[15px] rounded-md whitespace-nowrap transition-colors duration-200 ${
                    isActive(item.path)
                      ? overHero
                        ? "text-white font-semibold"
                        : "text-[#466EFA] font-semibold"
                      : overHero
                        ? "text-white/80 hover:text-white font-medium"
                        : "text-foreground/80 hover:text-[#466EFA] font-medium"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Theme Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-full ${inkClass} ${overHero ? "hover:bg-white/10" : "hover:bg-muted"} transition-all duration-200 cursor-pointer flex items-center justify-center`}
                aria-label="Toggle theme"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* WhatsApp Link */}
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with us on WhatsApp"
                title="Chat with us on WhatsApp"
                className={`p-2.5 rounded-full transition-all duration-200 hover:scale-110 hover:brightness-110 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${overHero ? "text-white hover:bg-white/10" : "text-whatsapp hover:bg-whatsapp/10"}`}
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
                </svg>
              </a>

              <Link to="/quote">
                <button className="px-6 py-2.5 font-medium text-[15px] text-white bg-[#466EFA] hover:bg-[#2f57e0] rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 group whitespace-nowrap">
                  Get quote
                  <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
                    <path d="M3.5 12H20.33"/>
                  </svg>
                </button>
              </Link>
            </div>

            {/* Mobile Actions & Menu Toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              {/* Theme Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-full ${inkClass} ${overHero ? "hover:bg-white/10" : "hover:bg-muted"} transition-all duration-200 cursor-pointer flex items-center justify-center`}
                aria-label="Toggle theme"
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* WhatsApp Link */}
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with us on WhatsApp"
                className={`p-2 rounded-full transition-all duration-200 hover:scale-110 hover:brightness-110 flex items-center justify-center ${overHero ? "text-white hover:bg-white/10" : "text-whatsapp hover:bg-whatsapp/10"}`}
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
                </svg>
              </a>

              <button
                onClick={() => setMobileMenuOpen(true)}
                className={`p-2 rounded-md ${inkClass} ${overHero ? "hover:bg-white/10" : "hover:bg-muted"} transition-all duration-200 cursor-pointer`}
                aria-label="Open navigation menu"
                aria-controls="mobileNav"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Spacer: the header is fixed, so inner pages need a placeholder to clear it.
          The home hero underlaps the transparent header, so it gets no spacer. */}
      {!isHome && <div className="h-[70px]" aria-hidden="true" />}

      {/* Full-screen mobile nav overlay (Lumex pattern) */}
      <div
        id="mobileNav"
        aria-hidden={!mobileMenuOpen}
        className={`fixed inset-0 z-[60] lg:hidden flex flex-col bg-background px-5 pt-3.5 pb-8 transition-all duration-300 ${
          mobileMenuOpen
            ? "opacity-100 visible translate-y-0"
            : "opacity-0 invisible -translate-y-2 pointer-events-none"
        }`}
      >
        {/* Overlay head: logo + close */}
        <div className="flex items-center justify-between min-h-[44px]">
          <Link to="/" className="flex items-center" aria-label="Ortex Industries home">
            <img src="/img/logo.svg" alt="Ortex Industries" className="h-[38px] w-auto object-contain object-left" />
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="flex-none w-9 h-9 rounded-full border border-border bg-background text-foreground flex items-center justify-center hover:bg-muted transition-colors duration-150"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Links */}
        <nav className="flex flex-col mt-6 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`block py-3.5 text-lg border-b border-border/60 transition-colors duration-200 ${
                isActive(item.path)
                  ? "text-[#466EFA] font-bold"
                  : "text-foreground hover:text-[#466EFA] font-normal"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <Link to="/quote" onClick={() => setMobileMenuOpen(false)} className="mt-6">
          <button className="w-full bg-[#466EFA] hover:bg-[#2f57e0] text-white py-3.5 font-medium rounded-full transition-all duration-200 flex items-center justify-center gap-2 group">
            Get quote
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
              <path d="M3.5 12H20.33"/>
            </svg>
          </button>
        </Link>
      </div>
    </>
  )
}
