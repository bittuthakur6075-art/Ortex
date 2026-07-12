import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X } from "lucide-react"
import { whatsappLink } from "../../constants/site"
import WhatsAppIcon from "../ui/WhatsAppIcon"

export default function Navbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    document.documentElement.classList.remove("dark")
    localStorage.setItem("theme", "light")
  }, [])

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

  // Ordered by the sequence a buyer evaluates us in. Labels are single words:
  // the old sentence-length labels ("Products & services", "Industries we
  // serve") cost scan time without adding meaning. Contact lives in the footer
  // and in the "Get quote" CTA — a manufacturer needs one door, not two.
  const navItems = [
    { name: "Products", path: "/products" },
    { name: "Industries", path: "/industries" },
    { name: "OEM", path: "/oem" },
    { name: "Work", path: "/work" },
    { name: "About", path: "/about" }
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
                className={`h-[30px] w-auto max-w-[220px] object-contain object-left transition-[filter] duration-300 ${
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
                        : "text-[#2f50e4] font-semibold"
                      : overHero
                        ? "text-white/80 hover:text-white font-medium"
                        : "text-foreground/80 hover:text-[#2f50e4] font-medium"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* WhatsApp Button */}
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with us on WhatsApp"
                title="Chat with us on WhatsApp"
                className="px-5 py-2.5 font-medium text-[15px] text-white bg-whatsapp hover:brightness-95 rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WhatsAppIcon className="w-[18px] h-[18px] fill-current" />
                WhatsApp
              </a>

              <Link to="/quote">
                <button className="px-6 py-2.5 font-medium text-[15px] text-white bg-[#2f50e4] hover:bg-[#193ee4] rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 group whitespace-nowrap">
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
              {/* WhatsApp Link */}
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with us on WhatsApp"
                className={`p-2 rounded-full transition-all duration-200 hover:scale-110 hover:brightness-110 flex items-center justify-center ${overHero ? "text-white hover:bg-white/10" : "text-whatsapp hover:bg-whatsapp/10"}`}
              >
                <WhatsAppIcon className="w-5 h-5 fill-current" />
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
                  ? "text-[#2f50e4] font-bold"
                  : "text-foreground hover:text-[#2f50e4] font-normal"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <Link to="/quote" onClick={() => setMobileMenuOpen(false)} className="mt-6">
          <button className="w-full bg-[#2f50e4] hover:bg-[#193ee4] text-white py-3.5 font-medium rounded-full transition-all duration-200 flex items-center justify-center gap-2 group">
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
