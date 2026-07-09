import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { useParams, Link, Navigate } from "react-router-dom"
import { Plus, Minus, ArrowRight, Clock, Package, MessageSquare } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import {
  PRODUCT_CATEGORIES, categoryBySlug, categoryStats, categoryFaqs,
  photosForCategory, buildCategorySchema,
} from "../constants/categories"

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

/**
 * SEO landing page per catalogue category. Everything rendered here is derived
 * from products.js / photos.js via constants/categories.js — the same data the
 * quote builder prices from, so the page can never disagree with a quotation.
 * scripts/prerender.mjs bakes this page's meta and JSON-LD into static HTML.
 */
export default function ProductCategory() {
  const { slug } = useParams()
  const entry = categoryBySlug(slug)

  // All hooks run unconditionally; the unknown-slug redirect happens below.
  const stats = useMemo(() => (entry ? categoryStats(entry) : null), [entry])
  const faqs = useMemo(() => (entry ? categoryFaqs(entry) : []), [entry])
  const photos = useMemo(() => (entry ? photosForCategory(entry, 8) : []), [entry])
  const [openFaq, setOpenFaq] = useState(0)

  useDocumentMetadata(entry?.seoTitle, entry?.seoDescription, {
    path: entry ? `/products/${entry.slug}` : undefined,
    image: photos[0]?.url,
  })

  useEffect(() => {
    if (!entry) return
    const script = document.createElement("script")
    script.type = "application/ld+json"
    script.id = "category-schema"
    script.innerHTML = JSON.stringify(buildCategorySchema(entry))
    document.head.appendChild(script)
    return () => document.getElementById("category-schema")?.remove()
  }, [entry])

  if (!entry) return <Navigate to="/products" replace />

  const others = PRODUCT_CATEGORIES.filter((c) => c.slug !== entry.slug)

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="py-14 md:py-20 bg-secondary border-b border-border/50">
        <div className="lp-wrap">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-5">
              <Link to="/" className="hover:text-primary">Home</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <Link to="/products" className="hover:text-primary">Products</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <span className="text-foreground font-medium">{entry.name}</span>
            </nav>
            <h1 className="text-[32px] md:text-[44px] font-medium leading-tight mb-5 text-foreground text-balance">
              {entry.name}, manufactured in-house
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-7">{entry.intro}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <Package className="h-4 w-4 text-primary" aria-hidden="true" />
                MOQ from <strong>{stats.moqMin} units</strong>
              </span>
              <span className="flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                Dispatch in <strong>{stats.leadLabel} working days</strong>
              </span>
              <span className="text-muted-foreground">
                From <strong className="text-foreground">{inr(stats.priceMin)}/unit</strong> + {stats.gstLabel} GST
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Production photos */}
      {photos.length > 0 && (
        <section className="py-14">
          <div className="lp-wrap">
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-[24px] md:text-[28px] font-medium text-foreground">
                Recent {entry.name.toLowerCase()} we produced
              </h2>
              <Link to="/work" className="text-sm font-semibold text-primary hover:underline whitespace-nowrap">
                Browse all work →
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((p) => (
                <figure key={p.url} className="group rounded-2xl overflow-hidden border border-border/60 bg-card">
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={p.url}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <figcaption className="p-3 text-xs font-medium text-foreground line-clamp-1">{p.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SKUs */}
      <section className="py-14 bg-secondary">
        <div className="lp-wrap">
          <h2 className="text-[24px] md:text-[28px] font-medium text-foreground mb-2">
            Catalogue products &amp; indicative pricing
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Prices are per-unit base rates before volume discounts; every order receives a formal GST quotation.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {stats.skus.map((p) => (
              <div key={p.id} className="bg-card border border-border/60 rounded-2xl p-6 flex flex-col hover:border-primary/40 hover:shadow-lg transition-all duration-300">
                <h3 className="font-bold text-foreground leading-snug">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{p.material}</p>
                <p className="text-sm text-muted-foreground mt-2 flex-1">{p.description}</p>
                <div className="mt-5 pt-4 border-t border-border/40 flex items-baseline justify-between">
                  <div className="text-lg font-extrabold text-foreground">
                    {inr(p.basePrice)}
                    <span className="text-xs font-normal text-muted-foreground"> / {p.unit}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    MOQ {p.moq} · {p.leadTimeDays}d dispatch
                  </div>
                </div>
                <Link
                  to={`/quote?add=${p.id}`}
                  className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-xl font-bold text-xs text-center transition-colors"
                >
                  Add to quote
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14">
        <div className="lp-wrap max-w-3xl">
          <h2 className="text-[24px] md:text-[28px] font-medium text-foreground mb-8">
            {entry.name} — common questions
          </h2>
          <div className="border-t border-border">
            {faqs.map((f, idx) => {
              const isOpen = openFaq === idx
              return (
                <div key={f.question} className="border-b border-border py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between text-left font-semibold text-foreground hover:text-primary transition-colors gap-4 py-1"
                  >
                    <span className={isOpen ? "text-primary" : ""}>{f.question}</span>
                    {isOpen
                      ? <Minus className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                      : <Plus className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">{f.answer}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Other categories — internal linking */}
      <section className="py-10 border-t border-border/50">
        <div className="lp-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
            Other product categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map((c) => (
              <Link
                key={c.slug}
                to={`/products/${c.slug}`}
                className="px-4 py-2 rounded-full text-sm font-medium bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="lp-wrap text-center">
          <h2 className="text-[28px] md:text-[38px] font-medium leading-tight mb-3 text-balance text-primary-foreground">
            Need {entry.name.toLowerCase()} for your organisation?
          </h2>
          <p className="text-[15px] mb-7 max-w-xl mx-auto text-primary-foreground/90">
            Build a quote in two minutes — pick products, set quantities, and our sales desk returns a formal GST quotation.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/quote"
              className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Get a quote <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to={`/contact?product=${encodeURIComponent(entry.name)}`}
              className="px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> Ask a question
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
