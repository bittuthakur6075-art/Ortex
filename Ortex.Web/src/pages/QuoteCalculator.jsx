import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus, Minus, Check, ArrowRight,
  ChevronLeft, AlertTriangle, Search,
} from "lucide-react"
import {
  Box, Diamonds, Personalcard, Medal, ClipboardText, Gift, Category,
  Timer1, ReceiptText, Building3, ShieldTick, ShoppingCart, Trash, Clock, DocumentUpload,
} from "iconsax-react"

// Reusable form styling pulled from the Contact page.
const fieldClass = "mt-2 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200"
const errBorder = "border-destructive focus:border-destructive"
const optionalTag = <span className="font-normal text-[#78829D]"> Optional</span>
import { toast } from "sonner"
import { Link, useSearchParams } from "react-router-dom"
import { submitEnquiry, newReference } from "../lib/leads"
import { ARTWORK_ACCEPT, ARTWORK_HINT, validateArtwork, uploadArtwork } from "../lib/uploads"
import { whatsappLink } from "../constants/site"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { PRODUCTS, CATEGORIES } from "../constants/products"
import { PRODUCT_CATEGORIES, photosForCategory } from "../constants/categories"
import { supabase, hasSupabase } from "../lib/supabaseClient"

const FALLBACK_IMAGE = "/img/welcome-workshop.avif"

// Real production photos per category (same source as the Work / Products
// pages), so each quote tile shows an actual product photo instead of an icon.
const CATEGORY_PHOTOS = Object.fromEntries(
  PRODUCT_CATEGORIES.map((e) => [e.category, photosForCategory(e, 12).map((p) => p.url)])
)

// Assign each static product a photo from its category, varied so products in
// the same category don't all repeat the same image.
const PRODUCT_IMAGE = (() => {
  const map = {}
  const counter = {}
  for (const p of PRODUCTS) {
    const photos = CATEGORY_PHOTOS[p.category] || []
    const i = counter[p.category] ?? 0
    counter[p.category] = i + 1
    map[p.id] = photos.length ? photos[i % photos.length] : FALLBACK_IMAGE
  }
  return map
})()

const productImage = (p) =>
  (p.images && p.images[0]) || PRODUCT_IMAGE[p.id] || CATEGORY_PHOTOS[p.category]?.[0] || FALLBACK_IMAGE

// iconsax Bulk icon per product category (replaces the old emoji set).
const CAT_ICONS = {
  "MDF products": Box,
  "Acrylic products": Diamonds,
  "Lanyards & ID card accessories": Personalcard,
  "Badge manufacturing": Medal,
  "Examination boards": ClipboardText,
  "Corporate gifting & merchandise": Gift,
}
const catIconComp = (name) => CAT_ICONS[name] || Box

// Truthful reassurance shown under the header. No pricing is shown anywhere on
// this page — customers receive a formal quotation from the sales desk.
const TRUST = [
  { icon: Building3, label: "100% in-house manufacturing" },
  { icon: Box, label: "Bulk & wholesale supply" },
  { icon: ReceiptText, label: "Formal GST quotation" },
  { icon: ShieldTick, label: "No obligation" },
]

export default function QuoteCalculator() {
  useDocumentMetadata(
    "Get a Quote: Custom Manufacturing RFQ | Ortex Industries",
    "Build a custom request from Ortex Industries' real product catalogue, including MDF, acrylic, lanyards, badges, exam boards, and corporate gifts. Add products, set quantities, and our sales desk sends a formal GST quotation.",
    { path: "/quote" }
  )

  const [step, setStep] = useState(1)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  // Cart is { [productId]: quantity }.
  const [cart, setCart] = useState({})
  const [contactData, setContactData] = useState({
    name: "", email: "", phone: "", company: "",
    logoFile: null, logoFileName: "", message: "",
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [reference, setReference] = useState("")
  // True when the enquiry couldn't reach the backend and sits in the outbox.
  const [isQueued, setIsQueued] = useState(false)

  const [productsList, setProductsList] = useState(hasSupabase ? [] : PRODUCTS)
  const [categoriesList, setCategoriesList] = useState(hasSupabase ? [] : CATEGORIES)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!hasSupabase) return

    async function fetchProducts() {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, doc")
        
        if (error) throw error
        
        if (data) {
          const activeProducts = data
            // Fill the fields the request builder relies on so an admin product
            // doc missing e.g. `material`/`moq` can't crash the filter
            // (.toLowerCase on undefined).
            .map((row) => ({
              name: "",
              material: "",
              category: "",
              moq: 1,
              leadTimeDays: 0,
              ...row.doc,
              id: row.id,
            }))
            .filter((p) => p.status === "active")

          if (activeProducts.length > 0) {
            setProductsList(activeProducts)
            const derivedCategories = [...new Set(activeProducts.map((p) => p.category).filter(Boolean))]
            setCategoriesList(derivedCategories)
          }
        }
      } catch (err) {
        console.error("Error fetching products from Supabase:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProducts()
  }, [])

  const productById = useMemo(() => Object.fromEntries(productsList.map((p) => [p.id, p])), [productsList])

  // Deep link from category landing pages: /quote?add=prod_key01 (comma-separable)
  // seeds the cart at each product's MOQ. Re-runs if the Supabase fetch swaps
  // the catalogue in, so an id that wasn't loaded yet still lands in the cart.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const ids = (searchParams.get("add") || "").split(",").filter(Boolean)
    if (ids.length === 0) return
    setCart((c) => {
      const next = { ...c }
      for (const id of ids) {
        const p = productById[id]
        if (p && next[id] == null) next[id] = p.moq
      }
      return next
    })
  }, [searchParams, productById])

  const filtered = useMemo(() => {
    let rows = productsList
    if (category !== "all") rows = rows.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => [p.name, p.material, p.category].some((v) => (v || "").toLowerCase().includes(q)))
    return rows
  }, [category, query, productsList])

  // Cart lines: product + quantity only. No pricing is computed or shown — the
  // sales desk sends a formal quotation after the request is submitted.
  const lines = useMemo(
    () => Object.entries(cart)
      // A cart id may not be in the current list (e.g. the async Supabase fetch
      // replaced the catalogue after an item was added) — drop it.
      .map(([id, qty]) => {
        const product = productById[id]
        return product ? { product, qty: Math.max(0, Math.round(Number(qty) || 0)) } : null
      })
      .filter(Boolean),
    [cart, productById]
  )
  const belowMoq = lines.filter((l) => l.qty > 0 && l.qty < l.product.moq)
  // Combined orders dispatch together, so the window follows the slowest line.
  const maxLeadTime = lines.reduce((m, l) => Math.max(m, l.product.leadTimeDays), 0)

  const addToCart = (product) => setCart((c) => (c[product.id] ? c : { ...c, [product.id]: product.moq }))
  const setQty = (id, qty) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.round(Number(qty) || 0)) }))
  const bumpQty = (id, delta) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }))
  const removeLine = (id) => setCart((c) => {
    const n = { ...c }
    delete n[id]
    return n
  })

  const validateContact = () => {
    const e = {}
    if (!contactData.name.trim()) e.name = "Name is required"
    if (!contactData.email.trim()) e.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) e.email = "Please enter a valid email address"
    if (!contactData.phone.trim()) e.phone = "Phone number is required"
    else if (!/^\+?[\d\s-]{10,}$/.test(contactData.phone)) e.phone = "Please enter a valid phone number"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const problem = validateArtwork(file)
    if (problem) {
      toast.error(problem)
      e.target.value = "" // let the customer re-pick the same corrected file
      setContactData((prev) => ({ ...prev, logoFile: null, logoFileName: "" }))
      return
    }
    setContactData((prev) => ({ ...prev, logoFile: file, logoFileName: file.name }))
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    if (lines.length === 0) {
      toast.error("Your quote is empty — add at least one product.")
      setStep(1)
      return
    }
    if (!validateContact()) return

    setIsSubmitting(true)

    // Minted up front so the artwork lands under the same reference the
    // customer is shown and the sales desk searches on.
    const ref = newReference()

    // Upload the artwork before the enquiry, so the enquiry can carry its path.
    // A failed upload must never block the lead — we record it and tell the
    // customer to send the file over WhatsApp instead.
    let artwork = null
    let artworkError = null
    if (contactData.logoFile) {
      const result = await uploadArtwork(contactData.logoFile, ref)
      if (result.error) artworkError = result.error
      else artwork = { path: result.path, fileName: contactData.logoFileName }
    }

    const itemLines = lines.map(
      (l) => `• ${l.product.name} × ${l.qty} ${l.product.unit}`
    )
    const categories = [...new Set(lines.map((l) => l.product.category))]
    const summaryLines = [
      "Quote request via RFQ builder",
      ...itemLines,
      maxLeadTime > 0 ? `Est. dispatch: ~${maxLeadTime} working days after artwork approval` : null,
      artwork ? `Artwork: ${artwork.fileName} (storage: artwork/${artwork.path})` : null,
      artworkError ? `⚠ Artwork "${contactData.logoFileName}" failed to upload — request it from the customer.` : null,
      contactData.message ? `Notes: ${contactData.message}` : null,
    ].filter(Boolean)

    const res = await submitEnquiry({
      reference: ref,
      source: "Quote calculator",
      customer: {
        name: contactData.name,
        email: contactData.email,
        phone: contactData.phone,
        company: contactData.company,
      },
      productInterest: categories.length === 1 ? categories[0] : "Multiple categories",
      message: summaryLines.join("\n"),
      notes: JSON.stringify({
        items: lines.map((l) => ({
          productId: l.product.id, name: l.product.name, sku: l.product.sku,
          category: l.product.category, unit: l.product.unit, quantity: l.qty,
        })),
        artwork, artworkError,
      }),
    })

    setIsSubmitting(false)
    setReference(res.reference)
    setIsQueued(Boolean(res.queued))

    if (res.queued) {
      toast.warning("Saved offline — we'll deliver it automatically. WhatsApp us to be certain.")
    } else if (artworkError) {
      toast.warning("Quote submitted, but your artwork didn't upload. Please WhatsApp the file.")
    } else {
      toast.success("Quote request submitted! Our sales desk will send a formal quotation.")
    }
    setIsSubmitted(true)
  }

  const resetAll = () => {
    setStep(1)
    setCart({})
    setContactData({ name: "", email: "", phone: "", company: "", logoFile: null, logoFileName: "", message: "" })
    setErrors({})
    setIsSubmitted(false)
    setIsQueued(false)
    setReference("")
  }

  // ---------------------------------------------------------------- success --
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background py-16">
        <div className="lp-wrap max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl p-8 md:p-12 text-center"
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isQueued ? "bg-amber-500/10 text-amber-500" : "bg-[#04B440]/10 text-[#04B440]"
            }`}>
              {isQueued ? <AlertTriangle className="h-9 w-9" /> : <Check className="h-9 w-9" />}
            </div>
            <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-foreground">
              {isQueued ? "Saved — delivery pending" : "Quote request submitted"}
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto">
              Your request is logged under reference <strong className="text-foreground">{reference}</strong>.
              {isQueued
                ? " We couldn't reach our servers just now, so it's saved on this device and will send automatically when the connection recovers. To be certain it reaches us today, send it over WhatsApp."
                : " Our sales desk will verify specs and send a formal GST quotation."}
            </p>

            {isQueued && (
              <a
                href={whatsappLink(`Hi Ortex, I submitted quote request ${reference} but it may not have reached you. Please send me a formal quotation.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors"
              >
                Send this request on WhatsApp
              </a>
            )}

            <div className="my-8 rounded-xl border border-border bg-secondary p-5 text-left">
              <h2 className="font-semibold text-foreground border-b border-border pb-2 mb-3">Your request</h2>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.product.id} className="flex justify-between text-sm gap-4">
                    <span className="text-foreground">{l.product.name}</span>
                    <span className="font-medium text-muted-foreground whitespace-nowrap">× {l.qty} {l.product.unit}</span>
                  </div>
                ))}
              </div>
              {maxLeadTime > 0 && (
                <p className="text-xs text-foreground mt-3 pt-3 border-t border-border flex items-center gap-1.5">
                  <Clock size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                  Est. dispatch ~{maxLeadTime} working days after artwork approval
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={resetAll} className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors cursor-pointer">
                Build another quote
              </button>
              <Link to="/">
                <button className="px-6 py-3 border border-border text-foreground hover:border-foreground/40 rounded-full font-semibold transition-colors cursor-pointer">
                  Return home
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------- summary aside
  // Rendered via a plain function call (not <QuoteSummary/>) so React keeps the
  // same element identity across renders — otherwise the quantity <input>s would
  // remount and lose focus on every keystroke.
  const renderSummary = (compact = false) => (
    <div className="bg-card border border-[#EBEDF3] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <ShoppingCart size={22} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
        <h2 className="text-[18px] font-semibold text-foreground">Your quote</h2>
        {lines.length > 0 && (
          <span className="ml-auto text-[12px] font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-1">
            {lines.length} item{lines.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-[#F4F6F8] grid place-items-center mx-auto mb-4 text-[#99A1B7]">
            <Box size={28} variant="Bulk" color="currentColor" aria-hidden="true" />
          </div>
          <p className="text-[15px] font-semibold text-foreground">No products yet</p>
          <p className="mt-1 text-[13px] text-[#78829D] leading-relaxed">
            Add items from the catalogue to build your quote.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {lines.map((l) => (
              <div key={l.product.id} className="border-b border-[#EBEDF3] pb-4 last:border-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-foreground leading-snug">{l.product.name}</div>
                    <div className="text-[12px] font-medium text-[#78829D] mt-0.5">MOQ {l.product.moq} {l.product.unit}</div>
                  </div>
                  <button onClick={() => removeLine(l.product.id)} aria-label={`Remove ${l.product.name}`} className="text-[#99A1B7] hover:text-destructive transition-colors shrink-0 cursor-pointer">
                    <Trash size={18} variant="Bulk" color="currentColor" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => bumpQty(l.product.id, -25)} aria-label="Decrease quantity" className="w-9 h-9 rounded-full border border-[#EBEDF3] grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number" min="0" value={l.qty}
                      onChange={(e) => setQty(l.product.id, e.target.value)}
                      className="w-12 h-9 text-center text-[15px] font-semibold text-foreground bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label={`Quantity for ${l.product.name}`}
                    />
                    <button onClick={() => bumpQty(l.product.id, 25)} aria-label="Increase quantity" className="w-9 h-9 rounded-full border border-[#EBEDF3] grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-[12px] font-medium text-[#78829D]">{l.product.unit}</span>
                </div>
                {l.qty > 0 && l.qty < l.product.moq && (
                  <p className="text-[11px] font-medium text-amber-500 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Below MOQ ({l.product.moq} {l.product.unit})
                  </p>
                )}
              </div>
            ))}
          </div>

          {maxLeadTime > 0 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[#F4F6F8] px-3.5 py-3">
              <Clock size={18} variant="Bulk" color="currentColor" className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-[12px] leading-snug">
                <span className="font-semibold text-foreground">Est. dispatch ~{maxLeadTime} working days</span>
                <span className="block text-[#78829D] mt-0.5">after artwork approval</span>
              </div>
            </div>
          )}

          {!compact && step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="mt-5 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3.5 font-semibold rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              Continue to details <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  )

  // ------------------------------------------------------------------- render
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="lp-wrap">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
            Get a quote
          </span>
          <h1 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground">
            Build your custom quote
          </h1>
          <p className="mt-5 text-[18px] font-normal text-muted-foreground leading-relaxed">
            Add the products you need, set your quantities, and submit your request. Our sales desk will send a
            formal GST quotation tailored to your specs and volumes.
          </p>
        </div>

        {/* Trust row */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mb-12">
          {TRUST.map((t) => (
            <span key={t.label} className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <t.icon size={18} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
              {t.label}
            </span>
          ))}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10 gap-3">
          {[{ n: 1, label: "Build quote" }, { n: 2, label: "Your details" }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  step === s.n ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : step > s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span className={`text-sm font-medium ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
              {i === 0 && <div className={`h-0.5 w-8 md:w-16 rounded ${step > 1 ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid lg:grid-cols-[1fr_360px] gap-6 items-start"
            >
              {/* Catalogue. min-w-0 lets the 1fr grid track shrink so the
                  single-row pills scroll inside it instead of blowing out the
                  page width (grid tracks default to min-width:auto). */}
              <div className="min-w-0">
                {/* Search */}
                <div className="relative mb-5">
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search products, e.g. keychain, trophy, badge…"
                    aria-label="Search products"
                    className="w-full pl-12 pr-5 py-3.5 rounded-full bg-background border border-[#EBEDF3] text-[16px] text-foreground placeholder:text-[#78829D] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
                  />
                </div>

                {/* Category chips — one row: centered when it fits, scrolls when it overflows (Work design language) */}
                <div className="mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex w-max mx-auto gap-2.5 px-1">
                    <button
                      onClick={() => setCategory("all")}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                        category === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
                      }`}
                    >
                      <Category size={16} variant="Bulk" color={category === "all" ? "currentColor" : "#78829D"} aria-hidden="true" />
                      All products
                    </button>
                    {categoriesList.map((c) => {
                      const Icon = catIconComp(c)
                      return (
                        <button
                          key={c} onClick={() => setCategory(c)}
                          className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                            category === c ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
                          }`}
                        >
                          <Icon size={16} variant="Bulk" color={category === c ? "currentColor" : "#78829D"} aria-hidden="true" />
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Product grid */}
                {isLoading && productsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                    <div className="w-8 h-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    <span>Loading catalogue...</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">No products match your search.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-9">
                    {filtered.map((p) => {
                      const inCart = cart[p.id] != null
                      return (
                        <div key={p.id} className="group flex flex-col">
                          {/* Image — flat tile with hover zoom (Work design language) */}
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted rounded-[24px] [corner-shape:squircle]">
                            <img
                              src={productImage(p)}
                              alt={p.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            />
                          </div>

                          {/* Caption */}
                          <div className="pt-3 flex flex-col flex-1">
                            <h3 className="text-[16px] font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-200">
                              {p.name}
                            </h3>
                            <p className="mt-1 text-[14px] font-medium text-[#4b5675] line-clamp-1">
                              {p.material || "Standard specification"}
                            </p>
                            <div className="flex-1" />

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 bg-[#F4F6F8] text-[#4B5675] rounded-full px-3 py-1.5 text-[12px] font-semibold">
                                <Box size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                                MOQ {p.moq} {p.unit}
                              </span>
                              <span className="inline-flex items-center gap-1.5 bg-[#F4F6F8] text-[#4B5675] rounded-full px-3 py-1.5 text-[12px] font-semibold">
                                <Timer1 size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                                {p.leadTimeDays}d dispatch
                              </span>
                            </div>

                            {inCart ? (
                              <div className="mt-4 w-full bg-[#E8FAEE] text-[#04B440] border border-[#BAEECC] py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 text-[13px]">
                                <Check className="h-4 w-4" /> Added to quote
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(p)}
                                className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[13px]"
                              >
                                <Plus className="h-4 w-4" /> Add to quote
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

              </div>

              {/* Summary aside */}
              <aside className="lg:sticky lg:top-24">
                {renderSummary()}
              </aside>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="grid lg:grid-cols-[1fr_360px] gap-6 items-start"
            >
              {/* Contact form */}
              <div className="bg-card border border-[#EBEDF3] rounded-[24px] p-6 md:p-8">
                <h2 className="text-[22px] font-semibold text-foreground mb-1">Your details</h2>
                <p className="text-[15px] text-[#4B5675] mb-6">We'll use these to send your formal quotation.</p>

                {belowMoq.length > 0 && (
                  <div className="flex items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs">
                      {belowMoq.length} item{belowMoq.length > 1 ? "s are" : " is"} below the minimum order quantity. We can still quote these, but our team may confirm feasibility or suggest the nearest run size.
                    </p>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} noValidate className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="calcName" className="block text-[16px] font-medium text-foreground">Name</label>
                      <input id="calcName" type="text" name="name" autoComplete="name" required
                        value={contactData.name}
                        onChange={(e) => setContactData((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Full name"
                        aria-invalid={Boolean(errors.name)}
                        className={`${fieldClass} ${errors.name ? errBorder : ""}`} />
                      {errors.name && <p className="text-sm text-destructive mt-1.5">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcEmail" className="block text-[16px] font-medium text-foreground">Email</label>
                      <input id="calcEmail" type="email" name="email" autoComplete="email" inputMode="email" required
                        value={contactData.email}
                        onChange={(e) => setContactData((p) => ({ ...p, email: e.target.value }))}
                        placeholder="your.email@example.com"
                        aria-invalid={Boolean(errors.email)}
                        className={`${fieldClass} ${errors.email ? errBorder : ""}`} />
                      {errors.email && <p className="text-sm text-destructive mt-1.5">{errors.email}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcPhone" className="block text-[16px] font-medium text-foreground">Phone</label>
                      <input id="calcPhone" type="tel" name="phone" autoComplete="tel" inputMode="tel" required
                        value={contactData.phone}
                        onChange={(e) => setContactData((p) => ({ ...p, phone: e.target.value.replace(/[^\d+\-\s()]/g, "") }))}
                        placeholder="+91-XXXXXXXXXX"
                        aria-invalid={Boolean(errors.phone)}
                        className={`${fieldClass} ${errors.phone ? errBorder : ""}`} />
                      {errors.phone && <p className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcCompany" className="block text-[16px] font-medium text-foreground">Company name{optionalTag}</label>
                      <input id="calcCompany" type="text" name="organization" autoComplete="organization"
                        value={contactData.company}
                        onChange={(e) => setContactData((p) => ({ ...p, company: e.target.value }))}
                        placeholder="Your company name"
                        className={fieldClass} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[16px] font-medium text-foreground">Upload logo / artwork{optionalTag}</label>
                    <div className="mt-2 flex items-center justify-center border-2 border-dashed border-[#EBEDF3] hover:border-primary/40 rounded-[20px] [corner-shape:squircle] p-8 bg-[#F9FBFC] hover:bg-white transition-colors relative">
                      <input type="file" accept={ARTWORK_ACCEPT} onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="text-center">
                        <DocumentUpload size={30} variant="Bulk" color="currentColor" className="text-primary mx-auto mb-3" aria-hidden="true" />
                        <p className="text-[18px] font-semibold text-foreground">
                          {contactData.logoFileName
                            ? <span className="text-primary">{contactData.logoFileName}</span>
                            : <span>Click to upload or drag &amp; drop</span>}
                        </p>
                        <p className="mt-1 text-[16px] font-normal text-[#78829D]">{ARTWORK_HINT}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="calcMessage" className="block text-[16px] font-medium text-foreground">Additional requirements{optionalTag}</label>
                    <textarea id="calcMessage" value={contactData.message}
                      onChange={(e) => setContactData((p) => ({ ...p, message: e.target.value }))}
                      placeholder="Colours, custom shapes, branding placement, delivery timeline or packaging preferences…"
                      className="mt-2 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200 min-h-[120px]" />
                  </div>

                  <div className="pt-6 border-t border-border">
                    <div className="flex flex-wrap-reverse gap-3 justify-between items-center">
                      <button type="button" onClick={() => setStep(1)}
                        className="px-5 py-3 border border-border hover:border-foreground/40 text-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer">
                        <ChevronLeft className="h-4 w-4" /> Back to catalogue
                      </button>
                      <button type="submit" disabled={isSubmitting}
                        className="px-7 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none">
                        {isSubmitting ? "Submitting…" : <>Get my quote <ArrowRight className="h-4 w-4" /></>}
                      </button>
                    </div>
                    <p className="mt-4 text-[13px] text-muted-foreground flex items-center gap-1.5">
                      <ShieldTick size={16} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                      No obligation. Our sales desk replies with a formal GST quotation. We never share your details.
                    </p>
                  </div>
                </form>
              </div>

              {/* Read-only summary */}
              <aside className="lg:sticky lg:top-24">
                {renderSummary(true)}
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
