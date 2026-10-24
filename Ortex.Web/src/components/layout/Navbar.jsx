import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X, Phone, Cart } from "../ui/Icons"
import { whatsappLink, CONTACT } from "../../constants/site"
import { useQuoteCount } from "../../lib/quoteCart"
import WhatsAppIcon from "../ui/WhatsAppIcon"
import { getLenis } from "../../hooks/useSmoothScroll"

export default function Navbar() {
  const location = useLocation()
  // Products in the visitor's unfinished quote (0 until the cart is restored
  // after hydration, so server and client render the same markup).
  const quoteCount = useQuoteCount()
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

  const menuRef = useRef(null)
  const menuCloseRef = useRef(null)
  const menuToggleRef = useRef(null)

  // While the mobile menu is open it behaves as a dialog: the page behind
  // stops scrolling (Lenis ignores body overflow, so it is stopped too), focus
  // moves to its close button and stays inside it, Escape closes it, and
  // focus goes back to the menu button afterwards.
  useEffect(() => {
    if (!mobileMenuOpen) return
    const menu = menuRef.current
    const toggle = menuToggleRef.current
    document.body.style.overflow = "hidden"
    getLenis()?.stop()
    menuCloseRef.current?.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false)
        return
      }
      if (e.key !== "Tab" || !menu) return
      const nodes = [...menu.querySelectorAll("a[href], button:not([disabled])")]
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (!menu.contains(document.activeElement)) { e.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      getLenis()?.start()
      // Back to the toggle, unless a link already took the visitor elsewhere.
      if (menu?.contains(document.activeElement)) toggle?.focus({ preventScroll: true })
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
  // serve") cost scan time without adding meaning.
  const navItems = [
    { name: "Products", path: "/products" },
    { name: "Industries", path: "/industries" },
    { name: "OEM", path: "/oem" },
    { name: "Work", path: "/work" },
    { name: "About", path: "/about" },
    { name: "Contact", path: "/contact" }
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
        inert={mobileMenuOpen || undefined}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 will-change-transform ${
          hidden && !mobileMenuOpen ? "-translate-y-full" : "translate-y-0"
        } ${
          overHero
            ? "bg-transparent"
            : "bg-white border-b border-border/50"
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
                className="px-5 py-2.5 font-medium text-[15px] text-[#071437] bg-whatsapp hover:brightness-95 rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WhatsAppIcon className="w-[18px] h-[18px] fill-current" />
                WhatsApp
              </a>

              <Link to="/quote"
                aria-label={quoteCount > 0 ? `Get quote, ${quoteCount} product${quoteCount > 1 ? "s" : ""} added` : undefined}
                className="px-6 py-2.5 font-medium text-[15px] text-white bg-[#2f50e4] hover:bg-[#193ee4] rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 group whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Get quote
                {quoteCount > 0 ? (
                  <span className="ml-0.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-white text-[#2f50e4] text-[12px] font-semibold grid place-items-center" aria-hidden="true">{quoteCount}</span>
                ) : (
                  <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
                    <path d="M3.5 12H20.33"/>
                  </svg>
                )}
              </Link>
            </div>

            {/* Mobile Actions & Menu Toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              {/* Unfinished quote: only shown once something is in it. */}
              {quoteCount > 0 && (
                <Link to="/quote"
                  aria-label={`Your quote, ${quoteCount} product${quoteCount > 1 ? "s" : ""}`}
                  className={`relative p-2 rounded-full transition-all duration-200 hover:scale-110 flex items-center justify-center ${inkClass} ${overHero ? "hover:bg-white/10" : "hover:bg-muted"}`}>
                  <Cart className="w-5 h-5" />
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2f50e4] text-white text-[11px] font-semibold grid place-items-center" aria-hidden="true">{quoteCount}</span>
                </Link>
              )}
              {/* Most mobile buyers would rather ring than type: one tap to the sales desk. */}
              <a
                href={`tel:${CONTACT.phonePrimary.replace(/[^+\d]/g, "")}`}
                aria-label={`Call Ortex Industries on ${CONTACT.phonePrimary}`}
                className={`p-2 rounded-full transition-all duration-200 hover:scale-110 flex items-center justify-center ${inkClass} ${overHero ? "hover:bg-white/10" : "hover:bg-muted"}`}
              >
                <Phone className="w-5 h-5" />
              </a>
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
                ref={menuToggleRef}
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

      {/* Full-screen mobile nav overlay (Lumex pattern). Visibility flips at once
          on open (a still-hidden menu refuses focus) and only after the 300 ms
          fade on close. */}
      <div
        id="mobileNav"
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen || undefined}
        data-lenis-prevent
        className={`fixed inset-0 z-[60] lg:hidden flex flex-col bg-background px-5 pt-3.5 pb-8 ${
          mobileMenuOpen
            ? "opacity-100 visible translate-y-0 [transition:opacity_300ms,transform_300ms,visibility_0s]"
            : "opacity-0 invisible -translate-y-2 pointer-events-none [transition:opacity_300ms,transform_300ms,visibility_0s_300ms]"
        }`}
      >
        {/* Overlay head: logo + close */}
        <div className="flex items-center justify-between min-h-[44px]">
          <Link to="/" className="flex items-center" aria-label="Ortex Industries home">
            <img src="/img/logo.svg" alt="Ortex Industries" className="h-[38px] w-auto object-contain object-left" />
          </Link>
          <button
            ref={menuCloseRef}
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
        <Link to="/quote" onClick={() => setMobileMenuOpen(false)}
          className="mt-6 w-full bg-[#2f50e4] hover:bg-[#193ee4] text-white py-3.5 font-medium rounded-full transition-all duration-200 flex items-center justify-center gap-2 group">
          {quoteCount > 0 ? `Your quote (${quoteCount})` : "Get quote"}
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
            <path d="M3.5 12H20.33"/>
          </svg>
        </Link>
      </div>
    </>
  )
}
