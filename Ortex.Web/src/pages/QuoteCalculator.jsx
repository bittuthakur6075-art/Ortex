import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calculator, Plus, Minus, Trash2, Check, Upload, ArrowRight,
  ChevronLeft, AlertTriangle, Search, ShoppingCart, Clock, Package,
} from "lucide-react"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { submitEnquiry } from "../lib/leads"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { PRODUCTS, CATEGORIES, CATEGORY_META, VOLUME_TIERS, priceLine } from "../constants/products"

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`
const catIcon = (name) => CATEGORY_META[name]?.icon || "📦"

export default function QuoteCalculator() {
  useDocumentMetadata(
    "Get a Quote: Custom Manufacturing RFQ | Ortex Industries",
    "Build a custom quote from Ortex Industries' real product catalogue, including MDF, acrylic, lanyards, badges, exam boards, and corporate gifts. Add products, set quantities, and get an instant bulk estimate with volume discounts."
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
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [reference, setReference] = useState("")

  const productById = useMemo(() => Object.fromEntries(PRODUCTS.map((p) => [p.id, p])), [])

  const filtered = useMemo(() => {
    let rows = PRODUCTS
    if (category !== "all") rows = rows.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => [p.name, p.material, p.category].some((v) => v.toLowerCase().includes(q)))
    return rows
  }, [category, query])

  // Computed cart lines + totals.
  const lines = useMemo(
    () => Object.entries(cart).map(([id, qty]) => {
      const product = productById[id]
      return { product, ...priceLine(product, qty) }
    }),
    [cart, productById]
  )
  const subtotal = lines.reduce((s, l) => s + l.gross, 0)
  const totalDiscount = lines.reduce((s, l) => s + l.discount, 0)
  const estimate = lines.reduce((s, l) => s + l.total, 0)
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
    if (file) setContactData((prev) => ({ ...prev, logoFile: file, logoFileName: file.name }))
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (lines.length === 0) {
      toast.error("Your quote is empty — add at least one product.")
      setStep(1)
      return
    }
    if (!validateContact()) return

    const itemLines = lines.map(
      (l) => `• ${l.product.name} × ${l.qty} ${l.product.unit} @ ₹${l.product.basePrice}` +
        `${l.discountPercent ? ` (−${l.discountPercent}%)` : ""} = ${inr(l.total)}`
    )
    const categories = [...new Set(lines.map((l) => l.product.category))]
    const summaryLines = [
      "Quote request via RFQ builder",
      ...itemLines,
      `Subtotal: ${inr(subtotal)}`,
      totalDiscount ? `Volume discount: −${inr(totalDiscount)}` : null,
      `Estimated total (pre-tax): ${inr(estimate)}  (+ GST as applicable)`,
      maxLeadTime > 0 ? `Est. dispatch: ~${maxLeadTime} working days after artwork approval` : null,
      contactData.logoFileName ? `Logo file: ${contactData.logoFileName}` : null,
      contactData.message ? `Notes: ${contactData.message}` : null,
    ].filter(Boolean)

    const res = await submitEnquiry({
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
          category: l.product.category, unit: l.product.unit, rate: l.product.basePrice,
          gstRate: l.product.gstRate, quantity: l.qty, discountPercent: l.discountPercent, lineTotal: l.total,
        })),
        subtotal, totalDiscount, estimatePreTax: estimate,
      }),
    })

    if (res.error) {
      toast.error("Couldn't submit your quote request. Please try again or WhatsApp us.")
      return
    }
    setReference(Date.now().toString().slice(-6))
    toast.success("Quote request submitted! Our sales desk will send a formal quotation.")
    setIsSubmitted(true)
  }

  const resetAll = () => {
    setStep(1)
    setCart({})
    setContactData({ name: "", email: "", phone: "", company: "", logoFile: null, logoFileName: "", message: "" })
    setErrors({})
    setIsSubmitted(false)
  }

  // ---------------------------------------------------------------- success --
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background py-16">
        <div className="lp-wrap max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/80 rounded-2xl p-8 md:p-10 text-center"
          >
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="h-9 w-9" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Quote request submitted</h1>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Thanks! Your request is logged under reference <strong className="text-foreground">#{reference}</strong>.
              Our sales desk will verify specs and send a formal GST quotation.
            </p>

            <div className="my-8 rounded-xl border border-border bg-secondary p-5 text-left">
              <h2 className="font-semibold text-foreground border-b border-border pb-2 mb-3">Your quote</h2>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.product.id} className="flex justify-between text-sm gap-4">
                    <span className="text-muted-foreground">{l.product.name} <span className="opacity-70">× {l.qty}</span></span>
                    <span className="font-medium text-foreground whitespace-nowrap">{inr(l.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border mt-3 pt-3">
                <span className="font-semibold text-foreground">Estimated total (pre-tax)</span>
                <span className="font-bold text-primary">{inr(estimate)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">+ GST as applicable · exclusive of shipping</p>
              {maxLeadTime > 0 && (
                <p className="text-xs text-foreground mt-2 flex items-center justify-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Est. dispatch ~{maxLeadTime} working days after artwork approval
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={resetAll} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors cursor-pointer">
                Build another quote
              </button>
              <Link to="/">
                <button className="px-5 py-2.5 border border-border text-foreground hover:bg-muted rounded-lg font-medium transition-colors cursor-pointer">
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
    <div className="bg-card border border-border/80 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-foreground">Your quote</h2>
        {lines.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
            {lines.length} item{lines.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No products yet.<br />Add items from the catalogue to build your quote.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {lines.map((l) => (
              <div key={l.product.id} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground leading-snug">{l.product.name}</div>
                    <div className="text-xs text-muted-foreground">₹{l.product.basePrice}/{l.product.unit}
                      {l.discountPercent > 0 && <span className="text-emerald-500 font-medium"> · −{l.discountPercent}%</span>}
                    </div>
                  </div>
                  <button onClick={() => removeLine(l.product.id)} aria-label={`Remove ${l.product.name}`} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center">
                    <button onClick={() => bumpQty(l.product.id, -25)} aria-label="Decrease quantity" className="w-7 h-7 rounded-l-lg border border-border bg-secondary hover:bg-muted flex items-center justify-center cursor-pointer">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number" min="0" value={l.qty}
                      onChange={(e) => setQty(l.product.id, e.target.value)}
                      className="w-14 h-7 border-y border-border bg-secondary text-center text-sm font-semibold text-foreground focus:outline-none"
                      aria-label={`Quantity for ${l.product.name}`}
                    />
                    <button onClick={() => bumpQty(l.product.id, 25)} aria-label="Increase quantity" className="w-7 h-7 rounded-r-lg border border-border bg-secondary hover:bg-muted flex items-center justify-center cursor-pointer">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-foreground">{inr(l.total)}</span>
                </div>
                {l.qty > 0 && l.qty < l.product.moq && (
                  <p className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Below MOQ ({l.product.moq} {l.product.unit})
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{inr(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-500 font-medium">
                <span>Volume discount</span><span>−{inr(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-foreground pt-1">
              <span>Estimated total</span><span className="text-primary">{inr(estimate)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Indicative pre-tax estimate. GST (12% to 18% as applicable) and shipping extra.</p>
          </div>

          {maxLeadTime > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary border border-border px-3 py-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-foreground font-medium">Est. dispatch ~{maxLeadTime} working days</span>
              <span className="text-muted-foreground">after artwork approval</span>
            </div>
          )}

          {!compact && step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="mt-4 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
            <Calculator className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Build your custom quote</h1>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            Add products from our catalogue, set your quantities and get an instant bulk estimate with volume discounts. Submit to receive a formal GST quotation from our sales desk.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10 gap-3">
          {[{ n: 1, label: "Build quote" }, { n: 2, label: "Your details" }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  step === s.n ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : step > s.n ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span className={`text-sm font-medium ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
              {i === 0 && <div className={`h-0.5 w-8 md:w-16 rounded ${step > 1 ? "bg-emerald-500" : "bg-muted"}`} />}
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
              {/* Catalogue */}
              <div>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query} onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search products…"
                      className="w-full pl-10 pr-4 py-2.5 bg-card border border-border focus:border-primary rounded-lg focus:outline-none text-foreground"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button
                    onClick={() => setCategory("all")}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                      category === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground/80 hover:border-primary/50"
                    }`}
                  >All products</button>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c} onClick={() => setCategory(c)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                        category === c ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground/80 hover:border-primary/50"
                      }`}
                    >{catIcon(c)} {c}</button>
                  ))}
                </div>

                {/* Product grid */}
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">No products match your search.</div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {filtered.map((p) => {
                      const inCart = cart[p.id] != null
                      return (
                        <div key={p.id} className="bg-card border border-border/70 rounded-xl p-5 flex flex-col hover:border-primary/50 hover:-translate-y-0.5 transition-all duration-200">
                          <div className="flex items-start justify-between">
                            <span className="text-2xl">{catIcon(p.category)}</span>
                            <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">{p.category.split(" ")[0]}</span>
                          </div>
                          <h3 className="font-semibold text-foreground mt-3 leading-tight">{p.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1 flex-1">{p.material}</p>
                          <div className="flex items-end justify-between mt-3">
                            <div>
                              <div className="text-lg font-bold text-foreground">₹{p.basePrice}<span className="text-xs font-normal text-muted-foreground">/{p.unit}</span></div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span>MOQ {p.moq}</span>
                                <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{p.leadTimeDays}d</span>
                              </div>
                            </div>
                          </div>
                          {inCart ? (
                            <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600">
                              <Check className="h-4 w-4" /> Added to quote
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(p)}
                              className="mt-4 w-full border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground py-2 font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Plus className="h-4 w-4" /> Add to quote
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Volume discount table */}
                <div className="mt-6 p-4 bg-secondary border border-border rounded-xl">
                  <h4 className="font-semibold text-foreground text-sm mb-2">Volume discounts (applied automatically per line)</h4>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    {VOLUME_TIERS.filter((t) => t.percent > 0).slice().reverse().map((t) => (
                      <span key={t.min}>🔹 {t.min.toLocaleString("en-IN")}+ units: <strong className="text-foreground">{t.percent}% off</strong></span>
                    ))}
                  </div>
                </div>
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
              <div className="bg-card border border-border/80 rounded-2xl p-6 md:p-8">
                <h2 className="text-xl font-bold text-foreground mb-1">Your details</h2>
                <p className="text-sm text-muted-foreground mb-6">We'll use these to send your formal quotation.</p>

                {belowMoq.length > 0 && (
                  <div className="flex items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs">
                      {belowMoq.length} item{belowMoq.length > 1 ? "s are" : " is"} below the minimum order quantity. We can still quote these, but our team may confirm feasibility or suggest the nearest run size.
                    </p>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="calcName" className="text-sm font-semibold text-foreground">Name *</label>
                      <input id="calcName" type="text" value={contactData.name}
                        onChange={(e) => setContactData((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Full name"
                        className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none text-foreground" />
                      {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcEmail" className="text-sm font-semibold text-foreground">Email *</label>
                      <input id="calcEmail" type="email" value={contactData.email}
                        onChange={(e) => setContactData((p) => ({ ...p, email: e.target.value }))}
                        placeholder="your.email@example.com"
                        className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none text-foreground" />
                      {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcPhone" className="text-sm font-semibold text-foreground">Phone *</label>
                      <input id="calcPhone" type="text" value={contactData.phone}
                        onChange={(e) => setContactData((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+91-XXXXXXXXXX"
                        className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none text-foreground" />
                      {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <label htmlFor="calcCompany" className="text-sm font-semibold text-foreground">Company name</label>
                      <input id="calcCompany" type="text" value={contactData.company}
                        onChange={(e) => setContactData((p) => ({ ...p, company: e.target.value }))}
                        placeholder="Your company name"
                        className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none text-foreground" />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-foreground">Upload logo / artwork (optional)</label>
                    <div className="mt-2 flex items-center justify-center border-2 border-dashed border-border/80 rounded-lg p-5 bg-secondary/50 hover:bg-secondary transition-colors relative">
                      <input type="file" accept="image/*,.pdf,.svg,.ai" onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="text-center space-y-1">
                        <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                        <p className="text-sm text-foreground">
                          {contactData.logoFileName
                            ? <span className="font-semibold text-primary">{contactData.logoFileName}</span>
                            : <span>Click to upload or drag & drop</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">SVG, AI, PDF or high-res PNG up to 10MB</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="calcMessage" className="text-sm font-semibold text-foreground">Additional requirements</label>
                    <textarea id="calcMessage" value={contactData.message}
                      onChange={(e) => setContactData((p) => ({ ...p, message: e.target.value }))}
                      placeholder="Colours, custom shapes, branding placement, delivery timeline or packaging preferences…"
                      className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none min-h-[90px] text-foreground" />
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-border">
                    <button type="button" onClick={() => setStep(1)}
                      className="px-5 py-2.5 border border-border hover:bg-muted text-foreground font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer">
                      <ChevronLeft className="h-4 w-4" /> Back to catalogue
                    </button>
                    <button type="submit"
                      className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg flex items-center gap-2 transition-colors cursor-pointer">
                      Submit request <Check className="h-4 w-4" />
                    </button>
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
