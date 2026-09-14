import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { useParams, Link, Navigate } from "react-router-dom"
import { Add, Minus, Clock, Box, ArrowRight, Truck, ShieldTick, Gallery, DiscountShape, ReceiptText, Building3 } from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import useJsonLd from "../hooks/useJsonLd"
import { categoryFaqs, buildProductSchema, productSeo } from "../constants/categories"
import { useCatalog } from "../lib/catalog"
import { productsInCategory } from "../lib/catalogCore"
import { whatsappLink } from "../constants/site"
import { fadeUp } from "../components/ui/Section"
import PageCTA from "../components/ui/PageCTA"

/**
 * One page per catalogue product: /products/:slug/:productSlug.
 *
 * The category pages list products as cards, which gave a buyer searching for
 * one item ("brass name badge", "insulated lunch box set") nothing to land on.
 * Everything here comes from products_public through useCatalog, the same rows
 * the quote builder reads, and scripts/prerender.mjs renders each product to
 * static HTML with its own title, description, canonical and JSON-LD. No price
 * is shown or marked up: quoting stays a conversation (migration 0020).
 */
export default function ProductDetail() {
  const { slug, productSlug } = useParams()
  const { products, categories, loading } = useCatalog()
  const entry = useMemo(() => categories.find((c) => c.slug === slug) || null, [categories, slug])
  const items = useMemo(() => (entry ? productsInCategory(entry, products) : []), [entry, products])
  const product = items.find((p) => p.slug === productSlug) || null
  const faqs = useMemo(() => (entry ? categoryFaqs(entry, products) : []), [entry, products])
  const [activeImage, setActiveImage] = useState(0)
  const [openFaq, setOpenFaq] = useState(null)

  const seo = entry && product ? productSeo(entry, product) : null
  useDocumentMetadata(seo?.title, seo?.description, {
    path: product?.path,
    image: product?.images?.[0],
  })
  useJsonLd("page-schema", entry && product ? buildProductSchema(entry, product) : null)

  if (!entry || !product) {
    if (loading) return null
    return <Navigate to={entry ? `/products/${entry.slug}` : "/products"} replace />
  }

  const images = product.images || []
  const related = items.filter((p) => p.id !== product.id).slice(0, 6)
  const specs = [
    { icon: Box, label: "Minimum order", value: `${product.moq} ${product.unit}` },
    { icon: Clock, label: "Dispatch", value: product.leadTimeDays ? `${product.leadTimeDays} working days` : "On quote" },
    { icon: DiscountShape, label: "Pricing", value: "On quote" },
    { icon: ReceiptText, label: "Invoicing", value: "GST invoice" },
  ]
  const trust = [
    { icon: Building3, title: "Branded in-house", text: "Your logo applied under our own roof, not subcontracted." },
    { icon: Gallery, title: "Free digital mockup", text: "You approve a 2D/3D layout before anything is produced." },
    { icon: Truck, title: "PAN India + export", text: "Dispatched across India with tracking, and exported worldwide." },
    { icon: ShieldTick, title: "GST quotation", text: "A formal, volume-discounted GST quotation for your run." },
  ]

  return (
    <div className="bg-background">
      <section className="pt-[120px] pb-[90px]">
        <div className="lp-wrap">
          <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground mb-8">
            <ol className="flex flex-wrap items-center gap-y-1">
              <li><Link to="/" className="hover:text-primary">Home</Link></li>
              <li aria-hidden="true" className="mx-2">/</li>
              <li><Link to="/products" className="hover:text-primary">Products</Link></li>
              <li aria-hidden="true" className="mx-2">/</li>
              <li><Link to={`/products/${entry.slug}`} className="hover:text-primary">{entry.name}</Link></li>
              <li aria-hidden="true" className="mx-2">/</li>
              <li aria-current="page" className="text-foreground font-medium">{product.name}</li>
            </ol>
          </nav>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Gallery */}
            <div>
              <div className="aspect-square overflow-hidden rounded-[6px] bg-muted">
                {images[activeImage] ? (
                  <img
                    src={images[activeImage]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted-foreground">
                    <Gallery size={48} color="currentColor" variant="Bulk" aria-hidden="true" />
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <ul className="mt-3 grid grid-cols-5 gap-2">
                  {images.map((src, i) => (
                    <li key={src}>
                      <button
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={`Show photo ${i + 1} of ${product.name}`}
                        aria-pressed={i === activeImage}
                        className={`block w-full aspect-square overflow-hidden rounded-[6px] bg-muted border-2 transition-colors ${
                          i === activeImage ? "border-primary" : "border-transparent hover:border-border"
                        }`}
                      >
                        <img src={src} alt={`${product.name}, photo ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Copy */}
            <div>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-4">
                {entry.name}
              </span>
              <h1 className="text-[36px] md:text-[48px] font-medium leading-[1.08] tracking-tight mb-6 text-foreground text-balance">
                {product.name}
              </h1>
              {product.description && (
                <p className="text-[18px] font-normal text-foreground leading-relaxed mb-6 whitespace-pre-line">
                  {product.description}
                </p>
              )}
              {product.material && (
                <p className="text-[15px] text-muted-foreground mb-8">
                  <span className="font-semibold text-foreground">Material:</span> {product.material}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-[10px] mb-8">
                {specs.map((s) => (
                  <div key={s.label} className="bg-secondary rounded-[6px] p-5">
                    <s.icon size={24} color="currentColor" variant="Bulk" className="text-primary mb-2" aria-hidden="true" />
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                    <dd className="text-[17px] font-semibold text-foreground mt-0.5">{s.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/quote?add=${product.id}`}
                  className="px-7 py-3.5 bg-primary text-primary-foreground hover:brightness-110 font-semibold text-[15px] rounded-full inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
                >
                  Add to quote
                  <ArrowRight size={18} color="currentColor" variant="Linear" aria-hidden="true" />
                </Link>
                <a
                  href={whatsappLink(`Hi Ortex, I'd like a quote for ${product.name}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-7 py-3.5 border border-border text-foreground hover:border-primary hover:text-primary font-semibold text-[15px] rounded-full inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
                >
                  Chat on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-[70px] border-y border-border/60 bg-secondary/40">
        <div className="lp-wrap grid sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
          {trust.map((t) => (
            <div key={t.title}>
              <t.icon size={30} color="currentColor" variant="Bulk" className="text-primary mb-3" aria-hidden="true" />
              <h2 className="text-[16px] font-semibold text-foreground mb-1.5">{t.title}</h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="section-y">
          <div className="lp-wrap max-w-3xl">
            <h2 className="text-[32px] md:text-[44px] font-normal leading-[1.05] tracking-tight text-foreground mb-8">
              Ordering {product.name}
            </h2>
            <div className="border-t border-border">
              {faqs.map((f, idx) => {
                const isOpen = openFaq === idx
                return (
                  <div key={f.question} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between text-left text-[17px] font-semibold text-foreground hover:text-primary transition-colors gap-4 py-5"
                    >
                      <span className={isOpen ? "text-primary" : ""}>{f.question}</span>
                      {isOpen
                        ? <Minus size={22} color="currentColor" variant="Bulk" className="text-primary flex-shrink-0" aria-hidden="true" />
                        : <Add size={22} color="currentColor" variant="Bulk" className="text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                    </button>
                    <p hidden={!isOpen} className="pb-5 -mt-1 text-[16px] text-muted-foreground leading-relaxed max-w-2xl">{f.answer}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="section-y bg-secondary">
          <div className="lp-wrap">
            <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <h2 className="text-[32px] md:text-[44px] font-normal leading-[1.05] tracking-tight text-foreground">
                More {entry.name.toLowerCase()}
              </h2>
              <Link to={`/products/${entry.slug}`} className="text-[14px] font-semibold text-primary hover:underline whitespace-nowrap">
                See the full range →
              </Link>
            </motion.div>
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-[10px]">
              {related.map((p) => (
                <li key={p.id} className="bg-card rounded-[6px] overflow-hidden">
                  <Link to={p.path} className="group block">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {p.images?.[0] && (
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="text-[16px] font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">{p.name}</h3>
                      <p className="text-[13px] text-muted-foreground mt-1">MOQ {p.moq} {p.unit}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <PageCTA
        title={`${product.name}, quoted for your run`}
        primary={{ to: `/quote?add=${product.id}`, label: "Get a quote" }}
        secondary={{ to: `/contact?product=${encodeURIComponent(product.name)}`, label: "Ask a question" }}
      >
        Tell us the quantity and your artwork, and our sales desk sends a formal GST quotation with a free digital mockup.
      </PageCTA>
    </div>
  )
}
