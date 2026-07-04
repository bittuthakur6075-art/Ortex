import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calculator, ChevronRight, ChevronLeft, Check, Upload, ArrowRight, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { Link } from "react-router-dom"

export default function QuoteCalculator() {
  useDocumentMetadata(
    "Interactive Quote Calculator - Ortex Industries",
    "Calculate instant price estimates for custom MDF, acrylic products, badges, lanyards, and corporate gifts. Configure specifications and request custom RFQs online."
  )

  const [step, setStep] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState("")
  const [specs, setSpecs] = useState({
    size: "Standard (2\"x2\")",
    width: "16mm",
    thickness: "3mm",
    material: "Standard PVC",
    attachment: "Pin",
    printMethod: "UV Printing",
    giftingType: "Customized Mug",
    customShape: false
  })
  const [quantity, setQuantity] = useState(100)
  const [contactData, setContactData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    logoFile: null,
    logoFileName: "",
    message: ""
  })
  const [errors, setErrors] = useState({})
  const [isSubmitted, setIsSubmitted] = useState(false)

  const categories = [
    { id: "mdf", name: "MDF products", basePrice: 15, moq: 100, icon: "🪵" },
    { id: "acrylic", name: "Acrylic products", basePrice: 25, moq: 50, icon: "💎" },
    { id: "lanyards", name: "Lanyards & ID card accessories", basePrice: 12, moq: 100, icon: "🎗️" },
    { id: "badges", name: "Badge manufacturing", basePrice: 18, moq: 50, icon: "🎖️" },
    { id: "boards", name: "Examination boards", basePrice: 65, moq: 25, icon: "📋" },
    { id: "gifting", name: "Corporate gifting & merchandise", basePrice: 120, moq: 20, icon: "🎁" }
  ]

  const activeCategoryObj = categories.find((c) => c.id === selectedCategory)

  // Specification options depending on selection
  const specOptions = {
    mdf: {
      sizes: [
        { label: "Small (2\"x2\")", price: 0 },
        { label: "Medium (3\"x3\")", price: 5 },
        { label: "Large (4\"x4\")", price: 10 }
      ],
      printMethods: [
        { label: "UV Printing", price: 10 },
        { label: "Laser Engraving", price: 15 }
      ]
    },
    acrylic: {
      thicknesses: [
        { label: "2mm thickness", price: 0 },
        { label: "3mm thickness", price: 8 },
        { label: "5mm thickness", price: 15 }
      ],
      printMethods: [
        { label: "UV Printing", price: 12 },
        { label: "Laser Engraving", price: 18 }
      ]
    },
    lanyards: {
      widths: [
        { label: "12mm width", price: 0 },
        { label: "16mm width", price: 3 },
        { label: "20mm width", price: 6 }
      ],
      printMethods: [
        { label: "Sublimation (Multicolor)", price: 5 },
        { label: "Screen Printing (Solid)", price: 2 }
      ],
      attachments: [
        { label: "Standard Fish Hook", price: 0 },
        { label: "Premium Trigger Hook", price: 2 },
        { label: "Safety Release Clip", price: 3 }
      ]
    },
    badges: {
      materials: [
        { label: "Acrylic Plastic", price: 0 },
        { label: "Metal Plate", price: 12 }
      ],
      attachments: [
        { label: "Standard Pin", price: 0 },
        { label: "Strong Magnet Backing", price: 10 }
      ]
    },
    boards: {
      materials: [
        { label: "Standard PVC Board", price: 0 },
        { label: "Clear Acrylic Board", price: 15 },
        { label: "Reinforced ABS Plastic", price: 10 }
      ],
      printMethods: [
        { label: "Single-Color Logo", price: 5 },
        { label: "Full-Color UV Print", price: 15 }
      ]
    },
    gifting: {
      types: [
        { label: "Branded Pen", price: -80 },
        { label: "Customized Mug", price: 0 },
        { label: "Executive Diary", price: 80 },
        { label: "Insulated Water Bottle", price: 100 }
      ]
    }
  }

  // Calculate Unit and Total Price
  const calculatePricing = () => {
    if (!activeCategoryObj) return { unitPrice: 0, totalPrice: 0, rawTotal: 0, discount: 0, discountPercent: 0 }

    let unitPrice = activeCategoryObj.basePrice
    const catSpecs = specOptions[selectedCategory]

    if (selectedCategory === "mdf") {
      const sizePrice = catSpecs.sizes.find((s) => s.label === specs.size)?.price || 0
      const printPrice = catSpecs.printMethods.find((p) => p.label === specs.printMethod)?.price || 0
      unitPrice += sizePrice + printPrice
      if (specs.customShape) unitPrice += 4
    } else if (selectedCategory === "acrylic") {
      const thickPrice = catSpecs.thicknesses.find((t) => t.label === specs.thickness)?.price || 0
      const printPrice = catSpecs.printMethods.find((p) => p.label === specs.printMethod)?.price || 0
      unitPrice += thickPrice + printPrice
      if (specs.customShape) unitPrice += 6
    } else if (selectedCategory === "lanyards") {
      const widthPrice = catSpecs.widths.find((w) => w.label === specs.width)?.price || 0
      const printPrice = catSpecs.printMethods.find((p) => p.label === specs.printMethod)?.price || 0
      const attachPrice = catSpecs.attachments.find((a) => a.label === specs.attachment)?.price || 0
      unitPrice += widthPrice + printPrice + attachPrice
    } else if (selectedCategory === "badges") {
      const matPrice = catSpecs.materials.find((m) => m.label === specs.material)?.price || 0
      const attachPrice = catSpecs.attachments.find((a) => a.label === specs.attachment)?.price || 0
      unitPrice += matPrice + attachPrice
    } else if (selectedCategory === "boards") {
      const matPrice = catSpecs.materials.find((m) => m.label === specs.material)?.price || 0
      const printPrice = catSpecs.printMethods.find((p) => p.label === specs.printMethod)?.price || 0
      unitPrice += matPrice + printPrice
    } else if (selectedCategory === "gifting") {
      const typePrice = catSpecs.types.find((t) => t.label === specs.giftingType)?.price || 0
      unitPrice += typePrice
    }

    const rawTotal = unitPrice * quantity
    let discountPercent = 0
    if (quantity >= 5000) discountPercent = 30
    else if (quantity >= 1000) discountPercent = 20
    else if (quantity >= 300) discountPercent = 10

    const discount = (rawTotal * discountPercent) / 100
    const totalPrice = rawTotal - discount

    return {
      unitPrice: Math.round(unitPrice * 100) / 100,
      rawTotal: Math.round(rawTotal),
      discount: Math.round(discount),
      totalPrice: Math.round(totalPrice),
      discountPercent
    }
  }

  const pricing = calculatePricing()

  const handleCategorySelect = (id) => {
    setSelectedCategory(id)
    // Reset specific defaults
    if (id === "mdf") {
      setSpecs((prev) => ({ ...prev, size: "Small (2\"x2\")", printMethod: "UV Printing" }))
      setQuantity(100)
    } else if (id === "acrylic") {
      setSpecs((prev) => ({ ...prev, thickness: "3mm thickness", printMethod: "UV Printing" }))
      setQuantity(50)
    } else if (id === "lanyards") {
      setSpecs((prev) => ({ ...prev, width: "16mm width", printMethod: "Sublimation (Multicolor)", attachment: "Standard Fish Hook" }))
      setQuantity(100)
    } else if (id === "badges") {
      setSpecs((prev) => ({ ...prev, material: "Acrylic Plastic", attachment: "Standard Pin" }))
      setQuantity(50)
    } else if (id === "boards") {
      setSpecs((prev) => ({ ...prev, material: "Standard PVC Board", printMethod: "Single-Color Logo" }))
      setQuantity(25)
    } else if (id === "gifting") {
      setSpecs((prev) => ({ ...prev, giftingType: "Customized Mug" }))
      setQuantity(20)
    }
    setStep(2)
  }

  const validateContact = () => {
    const tempErrors = {}
    if (!contactData.name.trim()) tempErrors.name = "Name is required"
    if (!contactData.email.trim()) {
      tempErrors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) {
      tempErrors.email = "Please enter a valid email address"
    }
    if (!contactData.phone.trim()) {
      tempErrors.phone = "Phone number is required"
    } else if (!/^\+?[\d\s-]{10,}$/.test(contactData.phone)) {
      tempErrors.phone = "Please enter a valid phone number"
    }
    setErrors(tempErrors)
    return Object.keys(tempErrors).length === 0
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setContactData((prev) => ({
        ...prev,
        logoFile: file,
        logoFileName: file.name
      }))
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (validateContact()) {
      // Mock saving query configuration
      const quotes = JSON.parse(localStorage.getItem("ortex_quotes") || "[]")
      const newQuote = {
        id: Date.now(),
        category: activeCategoryObj.name,
        specs,
        quantity,
        pricing,
        contact: {
          name: contactData.name,
          email: contactData.email,
          phone: contactData.phone,
          company: contactData.company,
          logoFileName: contactData.logoFileName,
          message: contactData.message
        },
        timestamp: new Date().toISOString()
      }
      quotes.push(newQuote)
      localStorage.setItem("ortex_quotes", JSON.stringify(quotes))

      toast.success("Quote request submitted successfully! Our sales desk will verify details.")
      setIsSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="lp-wrap max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
            <Calculator className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            B2B Custom Quote Estimator
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            Configure raw materials, dimensions, printing techniques, and quantities to generate instant bulk price estimates.
          </p>
        </div>

        {/* Steps Indicator */}
        {!isSubmitted && (
          <div className="flex items-center justify-center mb-10 space-x-2 md:space-x-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    step === s
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : step > s
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                {s < 4 && (
                  <div
                    className={`h-1 w-10 md:w-20 ml-2 md:ml-4 rounded transition-all duration-300 ${
                      step > s ? "bg-emerald-500" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-card border border-border/80 rounded-2xl p-6 md:p-10 shadow-lg text-left relative overflow-hidden">
          <AnimatePresence mode="wait">
            {isSubmitted ? (
              /* Success Screen */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-10"
              >
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check className="h-10 w-10 animate-bounce" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">RFQ Submitted Successfully!</h2>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Thank you for submitting your custom setup parameters. We have recorded your parameters under reference ID <strong>#{Date.now().toString().slice(-6)}</strong>.
                </p>

                <div className="my-8 p-6 bg-secondary rounded-xl border max-w-md mx-auto text-left space-y-3">
                  <h3 className="font-semibold text-foreground border-b pb-2">Configuration Summary</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Product Type</span>
                    <span className="font-medium text-foreground">{activeCategoryObj?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="font-medium text-foreground">{quantity} units</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground font-semibold">Estimated Total</span>
                    <span className="font-bold text-primary">₹ {pricing.totalPrice.toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Our sales representative will verify your design guidelines and send a final invoice with delivery logistics details.
                </p>

                <div className="mt-8 flex justify-center space-x-4">
                  <button
                    onClick={() => {
                      setStep(1)
                      setSelectedCategory("")
                      setContactData({ name: "", email: "", phone: "", company: "", logoFile: null, logoFileName: "", message: "" })
                      setIsSubmitted(false)
                    }}
                    className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/95 transition-all duration-200 cursor-pointer"
                  >
                    Configure New Quote
                  </button>
                  <Link to="/">
                    <button className="px-5 py-2.5 border-2 border-border text-foreground hover:bg-muted rounded-lg font-medium transition-all duration-200 cursor-pointer">
                      Return Home
                    </button>
                  </Link>
                </div>
              </motion.div>
            ) : (
              /* Wizard Screen views */
              <div className="space-y-6">
                {step === 1 && (
                  /* Step 1: Select Category */
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <h2 className="text-xl font-bold mb-6 text-foreground">Select Product Type</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => handleCategorySelect(cat.id)}
                          className={`p-6 border rounded-xl cursor-pointer hover:border-primary/80 hover:bg-primary/5 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between h-40 ${
                            selectedCategory === cat.id
                              ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                              : "border-border/60 bg-card"
                          }`}
                        >
                          <div className="text-3xl">{cat.icon}</div>
                          <div>
                            <h3 className="font-semibold text-foreground mt-2 leading-tight">{cat.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">Min. order: {cat.moq} units</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 2 && activeCategoryObj && (
                  /* Step 2: Configure Specification Parameters */
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6"
                  >
                    <h2 className="text-xl font-bold text-foreground">Configure Design Specs</h2>
                    <p className="text-sm text-muted-foreground -mt-3">
                      Selected Product: <strong className="text-primary">{activeCategoryObj.name}</strong>
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Dynamic specifications select render */}
                      {selectedCategory === "mdf" && (
                        <>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Select Size Option</label>
                            <select
                              value={specs.size}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, size: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.mdf.sizes.map((s) => (
                                <option key={s.label} value={s.label}>
                                  {s.label} {s.price > 0 ? `(+₹${s.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Branding Method</label>
                            <select
                              value={specs.printMethod}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, printMethod: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.mdf.printMethods.map((p) => (
                                <option key={p.label} value={p.label}>
                                  {p.label} {p.price > 0 ? `(+₹${p.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2 flex items-center mt-2">
                            <input
                              type="checkbox"
                              id="customShape"
                              checked={specs.customShape}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, customShape: e.target.checked }))}
                              className="w-4.5 h-4.5 accent-primary rounded cursor-pointer"
                            />
                            <label htmlFor="customShape" className="ml-3 text-sm font-medium text-foreground cursor-pointer">
                              Requires customized outer boundary shape cutting (+₹4 per unit)
                            </label>
                          </div>
                        </>
                      )}

                      {selectedCategory === "acrylic" && (
                        <>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Material Thickness</label>
                            <select
                              value={specs.thickness}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, thickness: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.acrylic.thicknesses.map((t) => (
                                <option key={t.label} value={t.label}>
                                  {t.label} {t.price > 0 ? `(+₹${t.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Branding Method</label>
                            <select
                              value={specs.printMethod}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, printMethod: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.acrylic.printMethods.map((p) => (
                                <option key={p.label} value={p.label}>
                                  {p.label} {p.price > 0 ? `(+₹${p.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2 flex items-center mt-2">
                            <input
                              type="checkbox"
                              id="customShapeAc"
                              checked={specs.customShape}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, customShape: e.target.checked }))}
                              className="w-4.5 h-4.5 accent-primary rounded cursor-pointer"
                            />
                            <label htmlFor="customShapeAc" className="ml-3 text-sm font-medium text-foreground cursor-pointer">
                              Requires customized outer boundary shape cutting (+₹6 per unit)
                            </label>
                          </div>
                        </>
                      )}

                      {selectedCategory === "lanyards" && (
                        <>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Lanyard Width</label>
                            <select
                              value={specs.width}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, width: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.lanyards.widths.map((w) => (
                                <option key={w.label} value={w.label}>
                                  {w.label} {w.price > 0 ? `(+₹${w.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Printing Method</label>
                            <select
                              value={specs.printMethod}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, printMethod: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.lanyards.printMethods.map((p) => (
                                <option key={p.label} value={p.label}>
                                  {p.label} {p.price > 0 ? `(+₹${p.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Attachment Accessory</label>
                            <select
                              value={specs.attachment}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, attachment: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.lanyards.attachments.map((a) => (
                                <option key={a.label} value={a.label}>
                                  {a.label} {a.price > 0 ? `(+₹${a.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {selectedCategory === "badges" && (
                        <>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Badge Material</label>
                            <select
                              value={specs.material}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, material: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.badges.materials.map((m) => (
                                <option key={m.label} value={m.label}>
                                  {m.label} {m.price > 0 ? `(+₹${m.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Attachment Hook</label>
                            <select
                              value={specs.attachment}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, attachment: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.badges.attachments.map((a) => (
                                <option key={a.label} value={a.label}>
                                  {a.label} {a.price > 0 ? `(+₹${a.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {selectedCategory === "boards" && (
                        <>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Board Material</label>
                            <select
                              value={specs.material}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, material: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.boards.materials.map((m) => (
                                <option key={m.label} value={m.label}>
                                  {m.label} {m.price > 0 ? `(+₹${m.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-foreground">Branding Level</label>
                            <select
                              value={specs.printMethod}
                              onChange={(e) => setSpecs((prev) => ({ ...prev, printMethod: e.target.value }))}
                              className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                            >
                              {specOptions.boards.printMethods.map((p) => (
                                <option key={p.label} value={p.label}>
                                  {p.label} {p.price > 0 ? `(+₹${p.price})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {selectedCategory === "gifting" && (
                        <div>
                          <label className="text-sm font-semibold text-foreground">Corporate Merchandise Option</label>
                          <select
                            value={specs.giftingType}
                            onChange={(e) => setSpecs((prev) => ({ ...prev, giftingType: e.target.value }))}
                            className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border focus:border-primary rounded-lg focus:outline-none cursor-pointer"
                          >
                            {specOptions.gifting.types.map((t) => (
                              <option key={t.label} value={t.label}>
                                {t.label} {t.price > 0 ? `(+₹${t.price})` : t.price < 0 ? `(-₹${Math.abs(t.price)})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-6 border-t border-border mt-8">
                      <button
                        onClick={() => setStep(1)}
                        className="px-5 py-2.5 border border-border hover:bg-muted text-foreground font-semibold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Back
                      </button>
                      <button
                        onClick={() => setStep(3)}
                        className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                      >
                        Next Step
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 3 && activeCategoryObj && (
                  /* Step 3: Quantities and Price calculations */
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6"
                  >
                    <h2 className="text-xl font-bold text-foreground">Set Quantity & Calculate Cost</h2>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center">
                          <label htmlFor="qtyInput" className="text-sm font-semibold text-foreground">Order Quantity</label>
                          <span className="text-xs text-muted-foreground">MOQ for this category is {activeCategoryObj.moq} units</span>
                        </div>
                        
                        <div className="flex items-center space-x-4 mt-2">
                          <input
                            id="qtyRange"
                            type="range"
                            min={Math.floor(activeCategoryObj.moq / 2)}
                            max="5000"
                            step="10"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value))}
                            className="flex-1 accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                          />
                          <input
                            id="qtyInput"
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-24 px-3 py-2 bg-secondary border border-border focus:border-primary rounded-lg text-center font-bold text-foreground"
                          />
                        </div>
                      </div>

                      {/* MOQ Alert Warning */}
                      {quantity < activeCategoryObj.moq && (
                        <div className="flex items-start space-x-3 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl">
                          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-semibold text-sm">Below Minimum Order Quantity</h4>
                            <p className="text-xs opacity-90 mt-0.5">
                              Setup printing parameters and raw-materials calibration require a minimum run of {activeCategoryObj.moq} units. Submitting below this threshold will require custom validation from our sales team.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Dynamic Price Display Board */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-border mt-8">
                        <div className="bg-secondary p-5 rounded-xl border">
                          <span className="text-xs text-muted-foreground uppercase font-semibold">Unit Price</span>
                          <div className="text-2xl font-bold text-foreground mt-1">₹ {pricing.unitPrice}</div>
                        </div>
                        <div className="bg-secondary p-5 rounded-xl border">
                          <span className="text-xs text-muted-foreground uppercase font-semibold">Volume Discount</span>
                          <div className="text-2xl font-bold text-emerald-500 mt-1">
                            {pricing.discountPercent > 0 ? `${pricing.discountPercent}% (-₹${pricing.discount.toLocaleString()})` : "0%"}
                          </div>
                        </div>
                        <div className="bg-primary/5 p-5 rounded-xl border border-primary/20">
                          <span className="text-xs text-primary uppercase font-semibold">Estimated Total</span>
                          <div className="text-2xl font-black text-primary mt-1">₹ {pricing.totalPrice.toLocaleString()}</div>
                        </div>
                      </div>

                      {/* Discount Info Banner */}
                      <div className="p-4 bg-secondary border border-border rounded-xl text-xs text-muted-foreground space-y-1">
                        <h4 className="font-semibold text-foreground text-sm mb-1">Volume Discounts Table</h4>
                        <p>🔹 300+ units: 10% discount</p>
                        <p>🔹 1,000+ units: 20% discount</p>
                        <p>🔹 5,000+ units: 30% discount</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-6 border-t border-border mt-8">
                      <button
                        onClick={() => setStep(2)}
                        className="px-5 py-2.5 border border-border hover:bg-muted text-foreground font-semibold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Back
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                      >
                        Submit Request
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 4 && activeCategoryObj && (
                  /* Step 4: Contact details & submit */
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6"
                  >
                    <h2 className="text-xl font-bold text-foreground">Buyer Details & Logo Submission</h2>
                    
                    <form onSubmit={handleFormSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label htmlFor="calcName" className="text-sm font-semibold text-foreground">Name *</label>
                          <input
                            id="calcName"
                            type="text"
                            value={contactData.name}
                            onChange={(e) => setContactData((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Full name"
                            className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                          />
                          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                        </div>

                        <div>
                          <label htmlFor="calcEmail" className="text-sm font-semibold text-foreground">Email *</label>
                          <input
                            id="calcEmail"
                            type="email"
                            value={contactData.email}
                            onChange={(e) => setContactData((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="your.email@example.com"
                            className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                          />
                          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                        </div>

                        <div>
                          <label htmlFor="calcPhone" className="text-sm font-semibold text-foreground">Phone *</label>
                          <input
                            id="calcPhone"
                            type="text"
                            value={contactData.phone}
                            onChange={(e) => setContactData((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="+91-XXXXXXXXXX"
                            className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                          />
                          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                        </div>

                        <div>
                          <label htmlFor="calcCompany" className="text-sm font-semibold text-foreground">Company Name</label>
                          <input
                            id="calcCompany"
                            type="text"
                            value={contactData.company}
                            onChange={(e) => setContactData((prev) => ({ ...prev, company: e.target.value }))}
                            placeholder="Your company name"
                            className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                          />
                        </div>
                      </div>

                      {/* File logo uploader */}
                      <div>
                        <label className="text-sm font-semibold text-foreground">Upload Logo Mockup (Optional)</label>
                        <div className="mt-2 flex items-center justify-center border-2 border-dashed border-border/80 rounded-lg p-5 bg-secondary/50 hover:bg-secondary transition-all duration-200 relative">
                          <input
                            type="file"
                            accept="image/*,.pdf,.svg,.ai"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="text-center space-y-1">
                            <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                            <p className="text-sm text-foreground">
                              {contactData.logoFileName ? (
                                <span className="font-semibold text-primary">{contactData.logoFileName}</span>
                              ) : (
                                <span>Click to upload or drag & drop</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">SVG, AI, PDF or High-res PNG up to 10MB</p>
                          </div>
                        </div>
                      </div>

                      {/* Custom comments message */}
                      <div>
                        <label htmlFor="calcMessage" className="text-sm font-semibold text-foreground">Additional Design Requirements</label>
                        <textarea
                          id="calcMessage"
                          value={contactData.message}
                          onChange={(e) => setContactData((prev) => ({ ...prev, message: e.target.value }))}
                          placeholder="Please supply details about colors, shapes, special hardware requirements, or logistics packaging preferences..."
                          className="mt-2 w-full px-4 py-2.5 bg-secondary border border-border/80 focus:border-primary rounded-lg focus:outline-none min-h-[90px] transition-all duration-200 text-foreground"
                        />
                      </div>

                      <div className="flex justify-between items-center pt-6 border-t border-border mt-8">
                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="px-5 py-2.5 border border-border hover:bg-muted text-foreground font-semibold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                        >
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Back
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-accent hover:bg-accent/95 text-accent-foreground font-bold rounded-lg flex items-center transition-all duration-200 cursor-pointer"
                        >
                          Submit RFQ Setup
                          <Check className="ml-2 h-4 w-4" />
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
