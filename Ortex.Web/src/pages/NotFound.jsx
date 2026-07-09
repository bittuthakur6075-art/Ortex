import { Link } from "react-router-dom"
import { ArrowRight, Home } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function NotFound() {
  useDocumentMetadata(
    "Page Not Found — Ortex Industries",
    "The page you are looking for does not exist. Go back to Ortex Industries homepage to explore custom manufacturing & corporate gifting.",
    { 
      robots: "noindex, nofollow"
    }
  )

  const links = [
    { to: "/products", label: "Products & services" },
    { to: "/portfolio", label: "Portfolio" },
    { to: "/industries", label: "Industries we serve" },
    { to: "/contact", label: "Contact us" },
  ]

  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="lp-wrap text-center max-w-2xl mx-auto">
        <p className="text-7xl md:text-8xl font-bold text-primary mb-4">404</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
          This page couldn't be found
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          The page you're looking for may have been moved or no longer exists. Let's get you back on track.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
          <Link
            to="/"
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
          <Link
            to="/quote"
            className="px-6 py-3 border-2 border-border hover:bg-muted text-foreground font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
          >
            Get a quote
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Helpful links" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-muted-foreground hover:text-primary transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  )
}
