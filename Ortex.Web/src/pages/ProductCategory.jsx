import { useState, useEffect, useMemo, useRef } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import { useParams, Link, Navigate } from "react-router-dom"
import {
  Add, Minus, Clock, Box, ArrowRight, Truck, ShieldTick, Gallery,
  DiscountShape, ReceiptText, Building3, CloseCircle, ArrowLeft2, ArrowRight2,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import {
  categoryStats, categoryFaqs, photosForCategory, buildCategorySchema,
} from "../constants/categories"
import { useCatalog } from "../lib/catalog"
import { whatsappLink } from "../constants/site"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"

/**
 * SEO landing page per catalogue category. Everything rendered here is derived
 * from products.js / photos.js via constants/categories.js — the same data the
 * quote builder prices from, so the page can never disagree with a quotation.
 * scripts/prerender.mjs bakes this page's meta and JSON-LD into static HTML.
 */
export default function ProductCategory() {
  const { slug } = useParams()
  // Live, Admin-managed catalogue (static fallback baked into useCatalog).
  const { products, categories, loading } = useCatalog()
  const entry = useMemo(() => categories.find((c) => c.slug === slug) || null, [categories, slug])

  // All hooks run unconditionally; the unknown-slug redirect happens below.
  const stats = useMemo(() => (entry ? categoryStats(entry, products) : null), [entry, products])
  const faqs = useMemo(() => (entry ? categoryFaqs(entry, products) : []), [entry, products])
  const photos = useMemo(() => (entry ? photosForCategory(entry, 8) : []), [entry])
  const materials = useMemo(
    () => (stats ? [...new Set(stats.skus.map((s) => s.material))] : []),
    [stats]
  )
  const [openFaq, setOpenFaq] = useState(0)

  // Sticky quote bar appears once the hero scrolls away.
  const [showBar, setShowBar] = useState(false)
  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > 640)
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Production-photo lightbox with keyboard navigation.
  const [lightbox, setLightbox] = useState(null)
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null)
      else if (e.key === "ArrowLeft") setLightbox((i) => (i === 0 ? photos.length - 1 : i - 1))
      else if (e.key === "ArrowRight") setLightbox((i) => (i === photos.length - 1 ? 0 : i + 1))
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [lightbox, photos.length])

  useDocumentMetadata(entry?.seoTitle, entry?.seoDescription, {
    path: entry ? `/products/${entry.slug}` : undefined,
    image: photos[0]?.url,
  })

  useEffect(() => {
    if (!entry) return
    const script = document.createElement("script")
    script.type = "application/ld+json"
    script.id = "category-schema"
    script.innerHTML = JSON.stringify(buildCategorySchema(entry, products))
    document.head.appendChild(script)
    return () => document.getElementById("category-schema")?.remove()
  }, [entry, products])

  // Shared cursor-following arrow over the photo grid, same as the Products hub.
  const areaRef = useRef(null)
  const cx = useMotionValue(0)
  const cy = useMotionValue(0)
  const springCfg = { stiffness: 350, damping: 32, mass: 0.5 }
  const sx = useSpring(cx, springCfg)
  const sy = useSpring(cy, springCfg)
  const [showCursor, setShowCursor] = useState(false)

  const pointerPos = (e) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const onCursorEnter = (e) => {
    const p = pointerPos(e)
    if (p) { cx.jump(p.x); cy.jump(p.y) }
    setShowCursor(true)
  }
  const onCursorMove = (e) => {
    const p = pointerPos(e)
    if (p) { cx.set(p.x); cy.set(p.y) }
  }

  // While the live catalogue is still loading, don't redirect an as-yet-unknown
  // slug (it may be an Admin-created category not in the static fallback).
  if (!entry) return loading ? null : <Navigate to="/products" replace />

  const others = categories.filter((c) => c.slug !== entry.slug)
  // Prefer an Admin category image, then a product's own image, then a photo.
  const firstProductImage = stats.skus.find((s) => s.images?.[0])?.images?.[0]
  const heroImage = entry.image || firstProductImage || photos[0]?.url
  const specs = [
    { icon: Box, label: "Minimum order", value: `${stats.moqMin} units` },
    { icon: Clock, label: "Dispatch", value: `${stats.leadLabel} working days` },
    { icon: DiscountShape, label: "Pricing", value: "On quote" },
    { icon: ReceiptText, label: "Invoicing", value: `${stats.gstLabel} GST` },
  ]

  const trust = [
    { icon: Building3, title: "100% in-house", text: "Cut, printed, and finished under our own roof — no subcontracting." },
    { icon: Truck, title: "PAN India + export", text: "Dispatched across India with tracking, and exported worldwide." },
    { icon: Gallery, title: "Free digital mockups", text: "A 2D/3D layout approved by you before anything goes to production." },
    { icon: ShieldTick, title: "GST quotation", text: "A formal, volume-discounted GST quotation for every order." },
  ]

  return (
    <div className="bg-background">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="pt-[120px] pb-[90px]">
        <div className="lp-wrap">
          <motion.nav
            {...fadeUp}
            aria-label="Breadcrumb"
            className="text-[13px] text-muted-foreground mb-8"
          >
            <Link to="/" className="hover:text-primary">Home</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <Link to="/products" className="hover:text-primary">Products</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <span className="text-foreground font-medium">{entry.name}</span>
          </motion.nav>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-4">
                Custom manufacturing
              </span>
              <h1 className="text-[40px] md:text-[56px] font-medium leading-[1.05] tracking-tight mb-6 text-foreground text-balance">
                {entry.name}, manufactured in-house
              </h1>
              <p className="text-[18px] font-normal text-foreground leading-relaxed mb-8 max-w-xl">
                {entry.intro}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/quote"
                  className="px-7 py-3.5 bg-primary text-primary-foreground hover:brightness-110 font-semibold text-[15px] rounded-full inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
                >
                  Get a quote
                  <ArrowRight size={18} color="currentColor" variant="Linear" aria-hidden="true" />
                </Link>
                <a
                  href={whatsappLink(`Hi Ortex, I'd like a quote for ${entry.name}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-7 py-3.5 border border-border text-foreground hover:border-primary hover:text-primary font-semibold text-[15px] rounded-full inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
                >
                  Chat on WhatsApp
                </a>
              </div>
            </motion.div>

            {/* Product image */}
            {heroImage && (
              <motion.div
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.1 }}
                className="relative"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-[6px] bg-muted">
                  <img
                    src={heroImage}
                    alt={photos[0]?.name || entry.name}
                    className="w-full h-full object-cover"
                    fetchPriority="high"
                  />
                </div>
                <span className="absolute left-4 top-4 bg-background/85 backdrop-blur-md text-foreground text-[12px] font-semibold px-3 py-1.5 rounded-full border border-border/50">
                  {stats.count} {stats.count === 1 ? "product" : "products"} in this range
                </span>
              </motion.div>
            )}
          </div>

          {/* Spec strip */}
          <motion.dl
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-[10px]"
          >
            {specs.map((s) => (
              <div key={s.label} className="bg-secondary rounded-[6px] p-5">
                <s.icon size={26} color="currentColor" variant="Bulk" className="text-primary mb-3" aria-hidden="true" />
                <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                <dd className="text-[18px] font-semibold text-foreground mt-0.5">{s.value}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <section className="py-[70px] border-y border-border/60 bg-secondary/40">
        <div className="lp-wrap grid sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
          {trust.map((t, idx) => (
            <motion.div
              key={t.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: Math.min(idx, 3) * 0.06 }}
            >
              <t.icon size={30} color="currentColor" variant="Bulk" className="text-primary mb-3" aria-hidden="true" />
              <h3 className="text-[16px] font-semibold text-foreground mb-1.5">{t.title}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{t.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Production photos ────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <section className="section-y">
          <div className="lp-wrap">
            <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <div>
                <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                  Real production
                </span>
                <h2 className="text-[40px] md:text-[56px] font-normal leading-[1.05] tracking-tight text-foreground">
                  <RevealWords text={`${entry.name} we actually shipped`} />
                </h2>
              </div>
              <Link to="/work" className="text-[14px] font-semibold text-primary hover:underline whitespace-nowrap">
                Browse all work →
              </Link>
            </motion.div>
            <div
              ref={areaRef}
              onMouseEnter={onCursorEnter}
              onMouseMove={onCursorMove}
              onMouseLeave={() => setShowCursor(false)}
              className="relative cursor-none"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-[30px] gap-y-[50px]">
                {photos.map((p, i) => (
                  <figure key={p.url} className="group">
                    <button
                      type="button"
                      onClick={() => setLightbox(i)}
                      aria-label={`View ${p.name} larger`}
                      className="block w-full aspect-square overflow-hidden bg-muted rounded-[6px] cursor-none"
                    >
                      <img
                        src={p.url}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                      />
                    </button>
                    <figcaption className="pt-4 text-[14px] font-medium text-muted-foreground line-clamp-1">{p.name}</figcaption>
                  </figure>
                ))}
              </div>

              {/* Shared cursor-following arrow (spring-trailed) */}
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute z-50 grid place-items-center rounded-full bg-primary text-primary-foreground"
                style={{ left: sx, top: sy, x: "-50%", y: "-50%" }}
                animate={{ opacity: showCursor ? 1 : 0, scale: showCursor ? 1 : 0.4, width: 48, height: 48 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <ArrowRight size={20} color="currentColor" variant="Bulk" />
              </motion.span>
            </div>
          </div>
        </section>
      )}

      {/* ── Catalogue SKUs ───────────────────────────────────────────────── */}
      {stats.count > 0 && (
      <section className="section-y bg-secondary">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-10">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              The catalogue
            </span>
            <h2 className="text-[40px] md:text-[56px] font-normal leading-[1.05] tracking-tight text-foreground mb-3">
              <RevealWords text="Products in this range" />
            </h2>
            <p className="text-[18px] font-normal text-muted-foreground max-w-2xl">
              Add anything to your quote and our sales desk returns a formal GST quotation with
              volume-tiered pricing for your run.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-[10px]">
            {stats.skus.map((p, idx) => (
              <motion.div
                key={p.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.06 }}
                className="bg-card rounded-[6px] p-[30px] flex flex-col border border-transparent hover:border-primary/30 transition-colors duration-300 overflow-hidden"
              >
                {p.images?.[0] && (
                  <div className="-m-[30px] mb-6 aspect-[4/3] overflow-hidden bg-muted">
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <h3 className="text-[20px] font-semibold text-foreground leading-snug">{p.name}</h3>
                <p className="text-[13px] font-medium text-primary mt-2">{p.material}</p>
                <p className="text-[15px] text-muted-foreground leading-relaxed mt-3 flex-1">{p.description}</p>
                <div className="mt-6 pt-5 border-t border-border/70 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Box size={15} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
                    MOQ {p.moq}
                  </span>
                  <span className="text-border" aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={15} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
                    {p.leadTimeDays}d dispatch
                  </span>
                </div>
                <Link
                  to={`/quote?add=${p.id}`}
                  className="mt-5 w-full bg-primary text-primary-foreground hover:brightness-110 py-3 rounded-full font-semibold text-[13px] text-center transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2"
                >
                  Add to quote
                  <ArrowRight size={15} color="currentColor" variant="Linear" aria-hidden="true" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Materials & customisation ────────────────────────────────────── */}
      {materials.length > 0 && (
        <section className="section-y">
          <div className="lp-wrap grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Materials & finishes
              </span>
              <h2 className="text-[40px] md:text-[56px] font-normal leading-[1.05] tracking-tight text-foreground mb-5">
                <RevealWords text="Built to your brand" />
              </h2>
              <p className="text-[18px] text-muted-foreground leading-relaxed">
                Every item is produced to your artwork and matched to your brand colours, with finishing
                like UV printing, laser engraving, and sublimation depending on the material.
              </p>
            </motion.div>
            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-4">
                Materials in this range
              </h3>
              <ul className="flex flex-wrap gap-[10px]">
                {materials.map((m) => (
                  <li
                    key={m}
                    className="px-4 py-2.5 rounded-full bg-secondary text-[14px] font-medium text-foreground border border-border/60"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="section-y bg-secondary">
        <div className="lp-wrap max-w-3xl">
          <motion.div {...fadeUp} className="mb-10">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Good to know
            </span>
            <h2 className="text-[40px] md:text-[56px] font-normal leading-[1.05] tracking-tight text-foreground">
              <RevealWords text={`${entry.name}: common questions`} />
            </h2>
          </motion.div>
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
                  {isOpen && (
                    <p className="pb-5 -mt-1 text-[16px] text-muted-foreground leading-relaxed max-w-2xl">{f.answer}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Cross-sell ───────────────────────────────────────────────────── */}
      <section className="py-[70px] border-t border-border/50">
        <div className="lp-wrap">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-5">
            Explore other categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map((c) => (
              <Link
                key={c.slug}
                to={`/products/${c.slug}`}
                className="px-4 py-2 rounded-full text-[14px] font-medium bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <PageCTA
        title={`${entry.name} in bulk, quoted in minutes`}
        primary={{ to: "/quote", label: "Get a quote" }}
        secondary={{ to: `/contact?product=${encodeURIComponent(entry.name)}`, label: "Ask a question" }}
      >
        Pick products, set quantities, and our sales desk sends a formal GST quotation. Two minutes, no
        obligation.
      </PageCTA>

      {/* ── Sticky quote bar ─────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
          showBar && lightbox === null ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="lp-wrap py-3">
          <div className="flex items-center gap-4 rounded-full bg-foreground text-background shadow-2xl pl-6 pr-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold truncate">{entry.name}</p>
              <p className="text-[12px] opacity-70 truncate">
                MOQ {stats.moqMin} · {stats.leadLabel}d dispatch · Free digital mockup
              </p>
            </div>
            <a
              href={whatsappLink(`Hi Ortex, I'd like a quote for ${entry.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
              className="hidden sm:grid place-items-center w-11 h-11 flex-none rounded-full bg-whatsapp text-white hover:brightness-95 transition"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 510 513" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M435.689 74.468C387.754 26.471 324 0.025 256.071 0C116.098 0 2.18 113.906 2.131 253.916C2.107 298.674 13.808 342.361 36.029 380.862L0 512.459L134.617 477.148C171.704 497.386 213.467 508.039 255.962 508.051H256.071C396.02 508.051 509.951 394.134 509.999 254.123C510.023 186.268 483.638 122.478 435.689 74.48V74.468ZM256.071 465.168H255.986C218.118 465.157 180.97 454.976 148.558 435.751L140.851 431.174L60.965 452.127L82.285 374.238L77.268 366.251C56.143 332.646 44.978 293.804 45.002 253.929C45.051 137.563 139.731 42.883 256.157 42.883C312.53 42.908 365.521 64.886 405.371 104.786C445.224 144.674 467.152 197.713 467.128 254.099C467.078 370.476 372.4 465.157 256.071 465.157V465.168ZM371.839 307.101C365.495 303.923 334.302 288.581 328.481 286.462C322.661 284.343 318.437 283.285 314.211 289.64C309.986 295.997 297.823 310.291 294.121 314.515C290.419 318.753 286.718 319.277 280.374 316.098C274.031 312.92 253.587 306.224 229.345 284.611C210.485 267.784 197.748 247.013 194.048 240.656C190.346 234.301 193.658 230.867 196.823 227.713C199.672 224.865 203.167 220.299 206.345 216.597C209.523 212.895 210.57 210.242 212.688 206.016C214.808 201.778 213.748 198.079 212.166 194.899C210.582 191.722 197.895 160.49 192.598 147.791C187.447 135.421 182.213 137.101 178.329 136.894C174.626 136.711 170.402 136.675 166.165 136.675C161.928 136.675 155.06 138.257 149.24 144.614C143.42 150.968 127.031 166.323 127.031 197.541C127.031 228.761 149.764 258.946 152.942 263.183C156.119 267.42 197.687 331.501 261.331 358.995C276.466 365.533 288.288 369.441 297.506 372.363C312.702 377.197 326.533 376.516 337.466 374.883C349.656 373.058 375.006 359.53 380.29 344.711C385.573 329.893 385.573 317.182 383.991 314.539C382.409 311.898 378.172 310.302 371.828 307.125L371.839 307.101Z" fill="currentColor"/>
              </svg>
            </a>
            <Link
              to="/quote"
              className="flex-none px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-[14px] hover:brightness-110 transition inline-flex items-center gap-2 whitespace-nowrap"
            >
              Get a quote
              <ArrowRight size={16} color="currentColor" variant="Bulk" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Photo lightbox ───────────────────────────────────────────────── */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={photos[lightbox].name}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute top-5 right-5 text-white/80 hover:text-white transition"
          >
            <CloseCircle size={34} color="currentColor" variant="Bulk" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === 0 ? photos.length - 1 : i - 1)) }}
            aria-label="Previous"
            className="absolute left-4 md:left-8 text-white/80 hover:text-white transition"
          >
            <ArrowLeft2 size={38} color="currentColor" variant="Bulk" />
          </button>
          <figure onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[85vh] flex flex-col items-center">
            <img
              src={photos[lightbox].url}
              alt={photos[lightbox].name}
              className="max-w-full max-h-[78vh] object-contain rounded-[6px]"
            />
            <figcaption className="mt-4 text-[14px] text-white/70">{photos[lightbox].name}</figcaption>
          </figure>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === photos.length - 1 ? 0 : i + 1)) }}
            aria-label="Next"
            className="absolute right-4 md:right-8 text-white/80 hover:text-white transition"
          >
            <ArrowRight2 size={38} color="currentColor" variant="Bulk" />
          </button>
        </div>
      )}
    </div>
  )
}
