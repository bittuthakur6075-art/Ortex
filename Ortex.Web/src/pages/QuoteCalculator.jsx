import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { submitEnquiry, newReference } from "../lib/leads"
import { validateArtwork, uploadArtwork } from "../lib/uploads"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { validateContactData } from "./quote-calculator/helpers"
import useQuoteCatalogue from "./quote-calculator/useQuoteCatalogue"
import useQuoteCart from "./quote-calculator/useQuoteCart"
import QuoteHeader from "./quote-calculator/QuoteHeader"
import StepIndicator from "./quote-calculator/StepIndicator"
import ProductPicker from "./quote-calculator/ProductPicker"
import BuyerDetailsStep from "./quote-calculator/BuyerDetailsStep"
import SummaryPanel from "./quote-calculator/SummaryPanel"
import SuccessScreen from "./quote-calculator/SuccessScreen"

export default function QuoteCalculator() {
  useDocumentMetadata(
    "Get a Quote: Custom Manufacturing RFQ | Ortex Industries",
    "Build a custom request from Ortex Industries' real product catalogue, including MDF, acrylic, lanyards, badges, exam boards, and corporate gifts. Add products, set quantities, and our sales desk sends a formal GST quotation.",
    { path: "/quote" }
  )

  const [step, setStep] = useState(1)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
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

  const { productsList, categoriesList, isLoading } = useQuoteCatalogue()
  const { cart, setCart, lines, belowMoq, maxLeadTime, addToCart, setQty, bumpQty, removeLine } = useQuoteCart(productsList)

  const filtered = useMemo(() => {
    let rows = productsList
    if (category !== "all") rows = rows.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => [p.name, p.material, p.category].some((v) => (v || "").toLowerCase().includes(q)))
    return rows
  }, [category, query, productsList])

  const validateContact = () => {
    const e = validateContactData(contactData)
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
      <SuccessScreen
        isQueued={isQueued}
        reference={reference}
        lines={lines}
        maxLeadTime={maxLeadTime}
        resetAll={resetAll}
      />
    )
  }

  const summaryProps = { step, setStep, lines, maxLeadTime, setQty, bumpQty, removeLine }

  // ------------------------------------------------------------------- render
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="lp-wrap">
        <QuoteHeader />
        <StepIndicator step={step} />

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
                cart={cart} addToCart={addToCart}
              />

              {/* Summary aside */}
              <aside className="lg:sticky lg:top-24">
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
                errors={errors} isSubmitting={isSubmitting}
                handleFileUpload={handleFileUpload} handleFormSubmit={handleFormSubmit}
                setStep={setStep}
              />

              {/* Read-only summary */}
              <aside className="lg:sticky lg:top-24">
                <SummaryPanel compact {...summaryProps} />
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
