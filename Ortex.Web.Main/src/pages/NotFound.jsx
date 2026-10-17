import { Link } from "react-router-dom"
import { ArrowRight, Home } from "../components/ui/Icons"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

const LINKS = [
  { to: "/products", label: "Products and services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/industries", label: "Industries we serve" },
  { to: "/about", label: "About us" },
]

export default function NotFound() {
  useDocumentMetadata(
    "Page not found (404) | Ortex Industries",
    "The page you are looking for does not exist or has moved. Explore our products and portfolio, or get in touch with Ortex Industries.",
    { robots: "noindex, follow" }
  )

  return (
    <section className="section-y-hero bg-background">
      <div className="lp-wrap text-center max-w-2xl">
        <p className="text-[72px] md:text-[96px] font-medium leading-none text-primary">404</p>
        <h1 className="mt-6 text-[32px] md:text-[48px] font-medium leading-[1.1] tracking-tight text-foreground text-balance">
          This page could not be found
        </h1>
        <p className="mt-5 text-[18px] text-[#4b5675]">
          It may have moved or no longer exists. These links will get you back on track.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          <Link to="/" className="lp-pill-btn primary gap-2">
            <Home size={18} aria-hidden="true" />
            Back to home
          </Link>
          <Link to="/contact" className="lp-pill-btn outline gap-2">
            Contact us
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <nav aria-label="Helpful links" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[15px]">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-[#4b5675] hover:text-primary transition-colors">{l.label}</Link>
          ))}
        </nav>
      </div>
    </section>
  )
}
