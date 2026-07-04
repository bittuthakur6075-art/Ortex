import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X, Sun, Moon } from "lucide-react"

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

  // Track scroll direction and solid state (smart-sticky header design)
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
  const headerBaseClass = isHome ? "fixed" : "sticky"
  // The hero is always light (white) in both themes. While the header is
  // transparent over it, force dark ink so the logo/nav stay visible in dark
  // mode. Once scrolled solid (or the mobile drawer is open) the header has a
  // themed background, so follow the theme via `text-foreground`.
  const overHero = isHome && !scrolled && !mobileMenuOpen
  const inkClass = overHero ? "text-[#071437]" : "text-foreground"

  return (
    <header 
      id="siteHeader"
      className={`${headerBaseClass} top-0 left-0 w-full z-50 transition-all duration-300 will-change-transform ${
        hidden && !mobileMenuOpen ? "-translate-y-full" : "translate-y-0"
      } ${
        mobileMenuOpen
          ? "h-screen h-dvh bg-background overflow-y-auto"
          : (isHome && !scrolled)
            ? "bg-transparent border-b border-transparent py-0"
            : "bg-background/95 backdrop-blur-md border-b shadow-sm py-0"
      }`}
    >
      <div className="lp-wrap h-full flex flex-col justify-start">
        
        {/* Main Nav Bar Row */}
        <div className="flex h-[70px] items-center justify-between shrink-0">
          
          {/* Logo & Branding */}
          <Link to="/" className="flex items-center space-x-2 mr-4 lg:mr-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            <div className="flex flex-col">
              <svg className={`h-5 md:h-6 w-auto ${inkClass} fill-current`} viewBox="0 0 32 9" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Ortex logo">
                <path d="M4.32 8.88C3.696 8.88 3.12 8.772 2.592 8.556C2.064 8.34 1.604 8.032 1.212 7.632C0.828 7.232 0.528 6.76 0.312 6.216C0.104 5.664 0 5.06 0 4.404C0 3.532 0.184 2.768 0.552 2.112C0.92 1.448 1.428 0.932 2.076 0.564C2.732 0.188 3.476 0 4.308 0C5.156 0 5.904 0.188 6.552 0.564C7.208 0.932 7.72 1.448 8.088 2.112C8.456 2.776 8.64 3.544 8.64 4.416C8.64 5.072 8.532 5.672 8.316 6.216C8.108 6.76 7.808 7.232 7.416 7.632C7.032 8.032 6.576 8.34 6.048 8.556C5.52 8.772 4.944 8.88 4.32 8.88ZM4.308 7.608C4.852 7.608 5.328 7.472 5.736 7.2C6.152 6.928 6.476 6.552 6.708 6.072C6.94 5.584 7.056 5.024 7.056 4.392C7.056 3.768 6.94 3.224 6.708 2.76C6.484 2.288 6.164 1.924 5.748 1.668C5.34 1.404 4.86 1.272 4.308 1.272C3.764 1.272 3.284 1.404 2.868 1.668C2.46 1.924 2.144 2.284 1.92 2.748C1.696 3.212 1.584 3.76 1.584 4.392C1.584 5.032 1.696 5.592 1.92 6.072C2.152 6.552 2.472 6.928 2.88 7.2C3.296 7.472 3.772 7.608 4.308 7.608Z" />
                <path d="M9.88734 8.76V2.64H11.3633V4.116H11.3993V8.76H9.88734ZM11.3993 5.568L11.2433 4.116C11.3873 3.596 11.6313 3.2 11.9753 2.928C12.3193 2.656 12.7313 2.52 13.2113 2.52C13.3793 2.52 13.4993 2.536 13.5713 2.568V3.996C13.5313 3.98 13.4753 3.972 13.4033 3.972C13.3313 3.964 13.2433 3.96 13.1393 3.96C12.5553 3.96 12.1193 4.088 11.8313 4.344C11.5433 4.6 11.3993 5.008 11.3993 5.568Z" />
                <path d="M17.4635 8.88C16.7115 8.88 16.1555 8.704 15.7955 8.352C15.4435 7.992 15.2675 7.456 15.2675 6.744V1.248L16.7915 0.684V6.78C16.7915 7.076 16.8715 7.296 17.0315 7.44C17.1915 7.584 17.4435 7.656 17.7875 7.656C17.9235 7.656 18.0435 7.648 18.1475 7.632C18.2595 7.608 18.3635 7.58 18.4595 7.548V8.724C18.3635 8.772 18.2275 8.808 18.0515 8.832C17.8755 8.864 17.6795 8.88 17.4635 8.88ZM14.0915 3.828V2.64H18.4595V3.828H14.0915Z" />
                <path d="M22.151 8.88C21.503 8.88 20.935 8.744 20.447 8.472C19.967 8.2 19.591 7.824 19.319 7.344C19.055 6.864 18.923 6.312 18.923 5.688C18.923 5.064 19.055 4.516 19.319 4.044C19.591 3.564 19.967 3.192 20.447 2.928C20.927 2.656 21.487 2.52 22.127 2.52C22.735 2.52 23.263 2.648 23.711 2.904C24.159 3.152 24.507 3.504 24.755 3.96C25.003 4.416 25.127 4.948 25.127 5.556C25.127 5.668 25.123 5.772 25.115 5.868C25.107 5.964 25.095 6.06 25.079 6.156H19.859V5.1H23.915L23.603 5.388C23.603 4.812 23.471 4.38 23.207 4.092C22.943 3.804 22.575 3.66 22.103 3.66C21.591 3.66 21.183 3.836 20.879 4.188C20.583 4.54 20.435 5.048 20.435 5.712C20.435 6.368 20.583 6.872 20.879 7.224C21.183 7.568 21.611 7.74 22.163 7.74C22.483 7.74 22.763 7.68 23.003 7.56C23.243 7.44 23.419 7.256 23.531 7.008H24.959C24.759 7.584 24.419 8.04 23.939 8.376C23.467 8.712 22.871 8.88 22.151 8.88Z" />
                <path d="M29.9545 8.76L28.0705 6.024L25.5265 2.64H27.2425L28.9465 5.124L31.6705 8.76H29.9545ZM28.1905 5.076L29.9065 2.64H31.5865L28.9225 6.132L28.1905 5.076ZM28.7905 6.204L26.9425 8.76H25.2745L28.0705 5.136L28.7905 6.204Z" />
              </svg>
              <span className={`text-[10px] ${inkClass} font-semibold mt-0.5 tracking-wider uppercase leading-none`}>Industries</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 flex-1 justify-center">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`px-4 py-2 text-[15px] transition-colors duration-200 ${
                  isActive(item.path)
                    ? "text-[#466EFA] font-semibold"
                    : `${overHero ? "text-[#071437]/80" : "text-foreground/80"} hover:text-[#466EFA] font-normal`
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center space-x-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full hover:bg-muted ${inkClass} transition-all duration-200 cursor-pointer flex items-center justify-center`}
              aria-label="Toggle theme"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* WhatsApp Link */}
            <a 
              href="https://wa.me/919211947188?text=Hi%20Ortex%20Industries%2C%20I%20would%20like%20to%20get%20a%20quote%20for%20customized%20products." 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label="Chat with us on WhatsApp"
              title="Chat with us on WhatsApp"
              className="p-2.5 rounded-full hover:bg-whatsapp/10 transition-all duration-200 hover:scale-110 hover:brightness-110 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-whatsapp"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
              </svg>
            </a>
            
            <Link to="/quote">
              <button className="px-6 py-2.5 font-medium text-[15px] text-white bg-[#466EFA] hover:bg-[#2f57e0] rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 group shadow-sm hover:shadow-md">
                Get quote
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
                  <path d="M3.5 12H20.33"/>
                </svg>
              </button>
            </Link>
          </div>

          {/* Mobile Actions & Menu Toggle */}
          <div className="flex items-center space-x-3 lg:hidden">
            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full hover:bg-muted ${inkClass} transition-all duration-200 cursor-pointer flex items-center justify-center`}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* WhatsApp Link */}
            <a 
              href="https://wa.me/919211947188?text=Hi%20Ortex%20Industries%2C%20I%20would%20like%20to%20get%20a%20quote%20for%20customized%20products." 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-whatsapp/10 transition-all duration-200 hover:scale-110 hover:brightness-110 flex items-center justify-center text-whatsapp"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
              </svg>
            </a>

            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-md hover:bg-muted ${inkClass} transition-all duration-200 cursor-pointer`}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

        </div>

        {/* Mobile Navigation Drawer Links */}
        {mobileMenuOpen && (
          <div className="flex-1 flex flex-col justify-between py-8">
            <nav className="flex flex-col space-y-1">
              {navItems.map((item) => (
                <Link 
                  key={item.path} 
                  to={item.path} 
                  onClick={() => setMobileMenuOpen(false)}
                  className={`py-3.5 text-lg border-b border-border/40 transition-colors duration-200 block ${
                    isActive(item.path) 
                      ? "text-[#466EFA] font-semibold" 
                      : "text-foreground/80 hover:text-[#466EFA] font-normal"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
            
            <div className="pt-6 border-t border-border mt-auto">
              <Link to="/quote" onClick={() => setMobileMenuOpen(false)}>
                <button className="w-full bg-[#466EFA] hover:bg-[#2f57e0] text-white py-3.5 font-medium rounded-full transition-all duration-200 flex items-center justify-center gap-2 group shadow-sm">
                  Get quote
                  <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.4301 5.92993L20.5001 11.9999L14.4301 18.0699"/>
                    <path d="M3.5 12H20.33"/>
                  </svg>
                </button>
              </Link>
            </div>
          </div>
        )}

      </div>
    </header>
  )
}
