import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { submitEnquiry, newReference } from "../lib/leads"
import { validateArtwork, uploadArtwork, artworkPath } from "../lib/uploads"
import { whatsappLink } from "../constants/site"
import { getLenis } from "../hooks/useSmoothScroll"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { ArrowRight } from "../components/ui/Icons"
import { validateContactData, FIELD_ORDER, MAX_QUOTE_LINES } from "./quote-calculator/helpers"
import useQuoteCatalogue from "./quote-calculator/useQuoteCatalogue"
import useQuoteCart from "./quote-calculator/useQuoteCart"
import QuoteHeader from "./quote-calculator/QuoteHeader"
import StepIndicator from "./quote-calculator/StepIndicator"
import ProductPicker from "./quote-calculator/ProductPicker"
import BuyerDetailsStep from "./quote-calculator/BuyerDetailsStep"
import SummaryPanel from "./quote-calculator/SummaryPanel"
import SuccessScreen from "./quote-calculator/SuccessScreen"

const EMPTY_CONTACT = {
  name: "", email: "", phone: "", company: "", city: "", neededBy: "",
  logoFile: null, logoFileName: "", message: "",
}

// "2026-11-05" -> "5 Nov 2026", for the sales desk's message.
const readableDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function QuoteCalculator() {
  useDocumentMetadata(
    "Get a Quote for Custom Products | Ortex Industries",
    "Build a request from the Ortex Industries catalogue: pick MDF, acrylic, lanyard, badge or gift products, set quantities, and receive a formal GST quotation.",
    { path: "/quote" }
  )

  const [step, setStep] = useState(1)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [contactData, setContactData] = useState(EMPTY_CONTACT)
  const [errors, setErrors] = useState({})
  // "" when idle, otherwise the button's progress text.
  const [submitState, setSubmitState] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [reference, setReference] = useState("")
  // True when the enquiry couldn't reach the backend and sits in the outbox.
  const [isQueued, setIsQueued] = useState(false)
  // Mobile: the quote summary opens as a bottom sheet from the sticky bar.
  const [sheetOpen, setSheetOpen] = useState(false)
  // What was sent, for the success screen (the cart is cleared on success).
  const [sent, setSent] = useState({ lines: [], maxLeadTime: 0 })
  const topRef = useRef(null)
  const sheetRef = useRef(null)

  const { productsList, categoriesList, isLoading, isFresh } = useQuoteCatalogue()
  const { cart, setCart, lines, belowMoq, emptyQty, maxLeadTime, addToCart: addLine, setQty, bumpQty, removeLine } = useQuoteCart(productsList, isFresh)
  const addToCart = (product) => {
    const added = addLine(product)
    if (added === false) toast.error(`A quote can hold up to ${MAX_QUOTE_LINES} products. Send this one, then start another.`)
    return added
  }
  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: undefined }))

  const filtered = useMemo(() => {
    let rows = productsList
    if (category !== "all") rows = rows.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => [p.name, p.material, p.category].some((v) => (v || "").toLowerCase().includes(q)))
    return rows
  }, [category, query, productsList])

  // Close the sheet once the cart empties, and let Escape close it.
  useEffect(() => {
    if (lines.length === 0) setSheetOpen(false)
  }, [lines.length])
  // The sheet is a modal dialog: focus moves into it, Tab stays inside it, and
  // closing it puts focus back on the control that opened it.
  useEffect(() => {
    if (!sheetOpen) return
    const opener = document.activeElement
    const frame = requestAnimationFrame(() => sheetRef.current?.focus())
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSheetOpen(false)
        return
      }
      const sheet = sheetRef.current
      if (e.key !== "Tab" || !sheet) return
      const items = [...sheet.querySelectorAll("button, input, [href]")].filter((el) => !el.disabled)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [sheetOpen])

  // Bring the step indicator back into view on a step change; on a phone the
  // tap that changed step is usually far down the page.
  const scrollToTop = () => {
    const el = topRef.current
    if (!el) return
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(el, { offset: -96 })
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: "smooth" })
  }

  const goToStep = (n) => {
    setSheetOpen(false)
    setStep(n)
    // After the new step has rendered.
    requestAnimationFrame(scrollToTop)
  }

  const continueToDetails = () => {
    if (lines.length === 0) {
      toast.error("Add at least one product to continue.")
      return
    }
    if (emptyQty.length > 0) {
      toast.error(`Enter a quantity for ${emptyQty[0].product.name}, or remove it.`)
      setSheetOpen(true)
      return
    }
    goToStep(2)
  }

  const focusFirstError = (errs) => {
    const key = FIELD_ORDER.find((k) => errs[k])
    if (!key) return
    const el = document.getElementById(`calc-${key}`)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const problem = validateArtwork(file)
    e.target.value = "" // let the customer re-pick the same corrected file
    if (problem) {
      toast.error(problem)
      setContactData((prev) => ({ ...prev, logoFile: null, logoFileName: "" }))
      return
    }
    setContactData((prev) => ({ ...prev, logoFile: file, logoFileName: file.name }))
  }

  const clearFile = () => setContactData((prev) => ({ ...prev, logoFile: null, logoFileName: "" }))

  const itemLines = lines.map((l) => `• ${l.product.name} × ${l.qty.toLocaleString("en-IN")} ${l.product.unit}`)

  // The same list, ready to send on WhatsApp instead of the form.
  const whatsappMessage = [
    "Hi Ortex, please send me a quotation for:",
    ...itemLines,
    contactData.city.trim() ? `Delivery: ${contactData.city.trim()}` : null,
    contactData.neededBy ? `Needed by: ${readableDate(contactData.neededBy)}` : null,
  ].filter(Boolean).join("\n")

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (submitState) return
    if (lines.length === 0) {
      toast.error("Your quote is empty. Add at least one product.")
      goToStep(1)
      return
    }
    if (emptyQty.length > 0) {
      toast.error(`Enter a quantity for ${emptyQty[0].product.name}, or remove it.`)
      return
    }
    const errs = validateContactData(contactData)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs)
      return
    }

    const city = contactData.city.trim()
    const neededBy = contactData.neededBy

    try {
      // Minted up front so the artwork lands under the same reference the
      // customer is shown and the sales desk searches on.
      const ref = newReference()

      // The enquiry is saved first and names the artwork's path; the file goes
      // up straight after. The storage policy accepts it only for a fresh
      // enquiry that names it (Admin migration 0079). A failed upload never
      // blocks the lead: the customer is asked to WhatsApp the file instead.
      const file = contactData.logoFile
      const artwork = file ? { path: artworkPath(file, ref), fileName: contactData.logoFileName } : null
      setSubmitState("Sending request…")

      const categories = [...new Set(lines.map((l) => l.product.category))]
      const note = contactData.message.trim()
      const buildMessage = (withItems) => [
        "Quote request via RFQ builder",
        ...(withItems ? itemLines : [`${lines.length} products, see the item list.`]),
        maxLeadTime > 0 ? `Est. dispatch: ~${maxLeadTime} working days after artwork approval` : null,
        city ? `Delivery: ${city}` : null,
        neededBy ? `Needed by: ${readableDate(neededBy)}` : null,
        artwork ? `Artwork: ${artwork.fileName} (storage: artwork/${artwork.path}). If it is not there, the upload failed: ask the customer to resend it.` : null,
        note ? `Notes: ${note}` : null,
      ].filter(Boolean).join("\n")

      const items = lines.map((l) => ({
        productId: l.product.id, name: l.product.name, sku: l.product.sku,
        category: l.product.category, unit: l.product.unit, quantity: l.qty,
      }))
      const notes = JSON.stringify({ items, artwork, city, neededBy })
      // The database refuses a message over 8000 characters or a row over
      // 32 KB, and a refused row cannot be sent later. The item list rides in
      // `items` and `notes` already, so a long order leaves it out of the text.
      let message = buildMessage(true)
      if (message.length > 8000 || new Blob([message, notes, notes]).size > 30000) message = buildMessage(false)
      message = message.slice(0, 8000)

      let res
      try {
        res = await submitEnquiry({
          reference: ref,
          source: "Quote calculator",
          customer: {
            name: contactData.name.trim(),
            email: contactData.email.trim(),
            phone: contactData.phone.trim(),
            company: contactData.company.trim(),
          },
          productInterest: categories.length === 1 ? categories[0] : "Multiple categories",
          items,
          artwork,
          message,
          notes,
        })
      } catch {
        toast.error("We could not send your quote request. Please WhatsApp or call us, and we will take it from there.")
        return
      }
      if (res.failed) {
        // Refused for good: keep the cart and the form, and offer WhatsApp.
        toast.error("We could not save this request. Please send it on WhatsApp instead, and we will take it from there.", {
          duration: 10000,
          action: { label: "WhatsApp", onClick: () => window.open(whatsappLink(whatsappMessage), "_blank", "noopener") },
        })
        return
      }

      // Upload only once the enquiry is in: the storage policy looks for it.
      let artworkError = null
      if (file && res.ok) {
        setSubmitState("Uploading artwork…")
        const result = await uploadArtwork(file, artwork.path)
        if (result.error) artworkError = result.error
      }
      setReference(res.reference)
      setIsQueued(Boolean(res.queued))

      if (res.queued) {
        toast.warning(file
          ? "Saved offline. We'll deliver it automatically. Please WhatsApp us your artwork, and to be certain it arrived."
          : "Saved offline. We'll deliver it automatically, but WhatsApp us to be certain.")
      } else if (artworkError) {
        toast.warning("Quote submitted, but your artwork didn't upload. Please WhatsApp the file.")
      } else {
        toast.success("Quote request submitted! Our sales desk will send a formal quotation.")
      }
      // The success screen keeps showing what was sent; the saved cart is
      // cleared now, so the next visit starts empty.
      setSent({ lines, maxLeadTime })
      setCart({})
      setIsSubmitted(true)
      requestAnimationFrame(() => window.scrollTo(0, 0))
    } finally {
      setSubmitState("")
    }
  }

  const resetAll = () => {
    setStep(1)
    setCart({})
    setContactData(EMPTY_CONTACT)
    setErrors({})
    setIsSubmitted(false)
    setIsQueued(false)
    setReference("")
    setSent({ lines: [], maxLeadTime: 0 })
    setQuery("")
    setCategory("all")
    requestAnimationFrame(() => window.scrollTo(0, 0))
  }

  // ---------------------------------------------------------------- success --
  if (isSubmitted) {
    return (
      <SuccessScreen
        isQueued={isQueued}
        reference={reference}
        lines={sent.lines}
        maxLeadTime={sent.maxLeadTime}
        resetAll={resetAll}
      />
    )
  }

  const summaryProps = { step, onContinue: continueToDetails, lines, maxLeadTime, setQty, bumpQty, removeLine }
  const totalUnits = lines.reduce((n, l) => n + l.qty, 0)

  // ------------------------------------------------------------------- render
  return (
    <div className={`min-h-screen bg-background pt-10 md:pt-12 ${step === 1 && lines.length > 0 ? "pb-40 lg:pb-12" : "pb-12"}`}>
      <div className="lp-wrap">
        <QuoteHeader />
        <div ref={topRef}>
          <StepIndicator step={step} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid lg:grid-cols-[1fr_360px] gap-6 items-start"
            >
              <ProductPicker
                query={query} setQuery={setQuery}
                category={category} setCategory={setCategory}
                categoriesList={categoriesList}
                isLoading={isLoading} productsList={productsList} filtered={filtered}
                cart={cart} addToCart={addToCart} setQty={setQty} bumpQty={bumpQty}
              />

              {/* Summary aside. On phones it is replaced by the sticky bar + sheet. */}
              <aside className="hidden lg:block lg:sticky lg:top-24">
                <SummaryPanel {...summaryProps} />
              </aside>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="grid lg:grid-cols-[1fr_360px] gap-6 items-start"
            >
              <BuyerDetailsStep
                belowMoq={belowMoq}
                contactData={contactData} setContactData={setContactData}
                errors={errors} clearError={clearError} submitState={submitState}
                handleFileUpload={handleFileUpload} clearFile={clearFile}
                handleFormSubmit={handleFormSubmit}
                onBack={() => goToStep(1)}
                whatsappMessage={whatsappMessage}
              />

              <aside className="lg:sticky lg:top-24">
                <SummaryPanel compact {...summaryProps} />
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile: sticky quote bar + summary sheet (step 1) ───────────────
          Sits above the voice assistant's launcher pill, which owns the
          bottom-right corner on every page. */}
      {step === 1 && lines.length > 0 && (
        // data-bottom-bar lifts the cookie notice above this bar on phones.
        <div data-bottom-bar="on" className="lg:hidden fixed inset-x-0 z-40 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] px-4">
          <div className="mx-auto max-w-xl flex items-center gap-3 rounded-full bg-foreground text-background shadow-2xl pl-5 pr-2 py-2">
            <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-expanded={sheetOpen}
              className="min-w-0 flex-1 text-left cursor-pointer py-1">
              <span className="block text-[14px] font-semibold truncate">
                {lines.length} item{lines.length > 1 ? "s" : ""} · {totalUnits.toLocaleString("en-IN")} units
              </span>
              <span className="block text-[12px] opacity-70 underline underline-offset-2">Review quote</span>
            </button>
            <button type="button" onClick={continueToDetails}
              className="flex-none px-5 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-[14px] inline-flex items-center gap-2 whitespace-nowrap cursor-pointer">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {sheetOpen && step === 1 && (
          <div className="lg:hidden fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Your quote">
            <motion.button
              type="button" aria-label="Close quote summary"
              onClick={() => setSheetOpen(false)}
              className="absolute inset-0 bg-black/40 cursor-default"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[28px] bg-card px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] focus:outline-none"
              data-lenis-prevent
              ref={sheetRef} tabIndex={-1}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[#DBDFE9]" aria-hidden="true" />
              <SummaryPanel bare {...summaryProps} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
