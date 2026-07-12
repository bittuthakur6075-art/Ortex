import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useSearchParams, Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Call, Sms, Global, Clock, Airplane } from "iconsax-react"
import { toast } from "sonner"
import { submitEnquiry } from "../lib/leads"
import { CONTACT, whatsappLink } from "../constants/site"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"
import WhatsAppIcon from "../components/ui/WhatsAppIcon"

/** Renders the shared WhatsApp glyph at the channel-badge size. Accepts (and
 *  ignores) the iconsax-style props so it slots in uniformly with the other
 *  channel icons. */
function WhatsAppMark() {
  return <WhatsAppIcon className="w-6 h-6 fill-current" />
}

const telHref = (num) => `tel:${num.replace(/[^+\d]/g, "")}`

export default function Contact() {
  useDocumentMetadata(
    "Contact Ortex Industries | Get a Custom Product Quote",
    "Get a fast, factory-direct quote for custom MDF, acrylic, lanyards, badges, and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in, or WhatsApp us. PAN India delivery and worldwide export.",
    { path: "/contact" }
  )

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    productInterest: "",
    message: "",
  })

  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchParams] = useSearchParams()

  useEffect(() => {
    const product = searchParams.get("product")
    const category = searchParams.get("category")

    if (product) {
      const mapCategory = (cat) => {
        if (!cat) return ""
        const lower = cat.toLowerCase()
        if (lower.includes("mdf")) return "MDF products"
        if (lower.includes("acrylic")) return "Acrylic products"
        if (lower.includes("lanyard") || lower.includes("id card")) return "Lanyards & ID card accessories"
        if (lower.includes("badge")) return "Badge manufacturing"
        if (lower.includes("gift")) return "Corporate gifting & promotional merchandise"
        if (lower.includes("stationery") || lower.includes("highlighter")) return "Corporate gifting & promotional merchandise"
        return "Other"
      }

      setFormData((prev) => ({
        ...prev,
        message: `Hi Ortex, I am interested in your portfolio item: "${product}". Please provide a customized quote for this product.`,
        productInterest: mapCategory(category) || prev.productInterest,
      }))
    }
  }, [searchParams])

  const productCategories = [
    "MDF products",
    "Acrylic products",
    "Lanyards & ID card accessories",
    "Badge manufacturing",
    "Examination boards",
    "Customized clipboards & writing pads",
    "Corporate gifting & promotional merchandise",
    "Customization & branding services",
    "Other",
  ]

  const channels = [
    {
      icon: Call,
      title: "Call us",
      details: [
        { label: CONTACT.phonePrimary, href: telHref(CONTACT.phonePrimary) },
        { label: CONTACT.phoneSecondary, href: telHref(CONTACT.phoneSecondary) },
      ],
    },
    {
      icon: Sms,
      title: "Email us",
      details: [{ label: CONTACT.email, href: `mailto:${CONTACT.email}` }],
    },
    {
      icon: WhatsAppMark,
      title: "WhatsApp",
      details: [{ label: CONTACT.phonePrimary, href: whatsappLink() }],
    },
    {
      icon: Clock,
      title: "Business hours",
      details: [
        { label: "Mon to Sat: 9:00 AM to 6:00 PM", href: null },
        { label: "Sunday: Closed", href: null },
      ],
    },
  ]

  const validateForm = () => {
    const tempErrors = {}
    if (!formData.name.trim()) {
      tempErrors.name = "Name is required"
    }
    if (!formData.email.trim()) {
      tempErrors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      tempErrors.email = "Please enter a valid email address"
    }
    if (!formData.phone.trim()) {
      tempErrors.phone = "Phone number is required"
    } else if (!/^\+?[\d\s-]{10,}$/.test(formData.phone)) {
      tempErrors.phone = "Please enter a valid phone number"
    }
    if (!formData.productInterest) {
      tempErrors.productInterest = "Please select a product category"
    }
    if (!formData.message.trim()) {
      tempErrors.message = "Message is required"
    } else if (formData.message.trim().length < 10) {
      tempErrors.message = "Message must be at least 10 characters"
    }
    setErrors(tempErrors)
    return Object.keys(tempErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)
    const res = await submitEnquiry({
      source: "Website contact form",
      customer: {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
      },
      productInterest: formData.productInterest,
      message: formData.message,
    })
    setIsSubmitting(false)

    if (res.queued) {
      toast.warning(
        `Saved as ${res.reference}. We could not reach our servers just now, so it will send automatically. WhatsApp us to be sure it lands.`,
        { duration: 10000, action: { label: "WhatsApp", onClick: () => window.open(whatsappLink(`Hi Ortex, my enquiry ${res.reference} may not have reached you. ${formData.message}`), "_blank", "noopener") } }
      )
    } else {
      toast.success(`Thanks, your enquiry is in. Reference ${res.reference}. We will be in touch within one working day.`)
    }
    setFormData({ name: "", email: "", phone: "", company: "", productInterest: "", message: "" })
    setErrors({})
  }

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const fieldClass =
    "mt-2 w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-colors duration-200"
  const labelClass = "block text-[13px] font-semibold text-foreground"

  return (
    <>
      {/* Page Header */}
      <PageHero title="We're here to help">
        Whether it is a product question, a custom project, or an order already in motion, reach our team directly. A real person replies within one working day.
      </PageHero>

      {/* Form + contact channels */}
      <section className="pb-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-14 lg:gap-20">

            {/* Form Side */}
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Send a message
              </span>
              <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Tell us what you need" />
              </h2>
              <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed max-w-xl">
                Share a few details about your project and our team will get back to you personally within one working day.
              </p>

              <form onSubmit={handleSubmit} className="mt-10 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className={labelClass}>Your name *</label>
                    <input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="So we know who we are talking to"
                      className={fieldClass}
                    />
                    {errors.name && <p className="text-sm text-destructive mt-1.5">{errors.name}</p>}
                  </div>

                  <div>
                    <label htmlFor="email" className={labelClass}>Email *</label>
                    <input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="your.email@example.com"
                      className={fieldClass}
                    />
                    {errors.email && <p className="text-sm text-destructive mt-1.5">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="phone" className={labelClass}>Phone *</label>
                    <input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      placeholder="+91-XXXXXXXXXX"
                      className={fieldClass}
                    />
                    {errors.phone && <p className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
                  </div>

                  <div>
                    <label htmlFor="company" className={labelClass}>Company (optional)</label>
                    <input
                      id="company"
                      type="text"
                      value={formData.company}
                      onChange={(e) => handleChange("company", e.target.value)}
                      placeholder="Your company or brand"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="productInterest" className={labelClass}>What can we make for you? *</label>
                  <select
                    id="productInterest"
                    value={formData.productInterest}
                    onChange={(e) => handleChange("productInterest", e.target.value)}
                    className={`${fieldClass} cursor-pointer`}
                  >
                    <option value="">Choose a product category</option>
                    {productCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.productInterest && <p className="text-sm text-destructive mt-1.5">{errors.productInterest}</p>}
                </div>

                <div>
                  <label htmlFor="message" className={labelClass}>Your requirements *</label>
                  <textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    placeholder="Quantities, materials, sizes, deadlines, and any artwork you already have. The more detail, the faster we can quote."
                    className={`${fieldClass} min-h-[140px] resize-y`}
                  />
                  {errors.message && <p className="text-sm text-destructive mt-1.5">{errors.message}</p>}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group w-full sm:w-auto px-7 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {isSubmitting ? "Sending..." : "Send my enquiry"}
                    {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
                  </button>
                  <p className="text-[13px] text-muted-foreground">
                    Replies within one working day. Your details stay private and are never shared.
                  </p>
                </div>
              </form>
            </motion.div>

            {/* Channels Side */}
            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Prefer to talk?
              </span>
              <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Reach us directly" />
              </h2>
              <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed">
                Pick whichever is easiest. Every message reaches our team directly, with no call centre in between.
              </p>

              <div className="mt-8">
                {channels.map((channel) => (
                  <div
                    key={channel.title}
                    className="flex items-start gap-5 border-t border-border py-6 last:border-b"
                  >
                    <div className="flex-shrink-0 w-[50px] h-[50px] rounded-[999px] bg-primary/10 grid place-items-center text-primary">
                      <channel.icon size={24} variant="Bulk" color="currentColor" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[18px] font-semibold text-foreground">{channel.title}</h3>
                      <div className="mt-1 space-y-0.5">
                        {channel.details.map((detail) => (
                          <div key={detail.label}>
                            {detail.href ? (
                              <a
                                href={detail.href}
                                target={detail.href.startsWith("http") ? "_blank" : undefined}
                                rel={detail.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                className="text-[15px] text-[#4b5675] hover:text-primary transition-colors duration-200"
                              >
                                {detail.label}
                              </a>
                            ) : (
                              <p className="text-[15px] text-[#4b5675]">{detail.label}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Already know your specs — dedicated quote-builder section */}
      <section className="py-[140px] bg-[#f9fbfc]">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Already know your specs?
              </span>
              <h2 className="text-[40px] md:text-[56px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Get pricing in minutes" />
              </h2>
              <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed max-w-xl">
                Skip the back and forth. Our quote builder walks you through material, size, and quantity, then returns factory-direct pricing on the spot.
              </p>
              <Link
                to="/quote"
                className="group mt-8 inline-flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-full transition-all duration-200 active:scale-[0.98]"
              >
                Open the quote builder
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="bg-card p-[40px] md:p-[48px]"
            >
              <ol className="list-none">
                {[
                  { title: "Pick product and material", description: "Choose from MDF, acrylic, lanyards, badges, and more." },
                  { title: "Set size and quantity", description: "Enter your dimensions and how many units you need." },
                  { title: "See instant pricing", description: "Get volume-tiered, factory-direct pricing on the spot." },
                ].map((step, idx, arr) => (
                  <li
                    key={step.title}
                    className={`flex gap-5 ${idx < arr.length - 1 ? "pb-6 mb-6 border-b border-border" : ""}`}
                  >
                    <span className="flex-shrink-0 text-[15px] font-semibold text-primary tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-[18px] font-semibold text-foreground">{step.title}</h3>
                      <p className="mt-1 text-[15px] text-[#4b5675] leading-relaxed">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Where we deliver */}
      <section className="py-[140px] bg-background text-center">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="max-w-2xl mx-auto mb-14">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Where we deliver
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="Across India and worldwide" />
            </h2>
            <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed">
              From a single studio run to a nationwide rollout, our logistics partners get your order to the door on time.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px] text-left">
            {[
              { icon: Global, title: "PAN India delivery", description: "Tracked, reliable couriers dispatched fast from our own floor to every state in the country." },
              { icon: Airplane, title: "Worldwide export", description: "Exporting abroad? We handle the documentation and shipping so your order clears and arrives without the hassle." },
            ].map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.08 }}
                className="bg-card p-[40px]"
              >
                <div className="w-[50px] h-[50px] rounded-[999px] bg-primary/10 grid place-items-center text-primary mb-6">
                  <item.icon size={24} variant="Bulk" color="currentColor" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-semibold text-foreground">{item.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] font-normal text-[#4b5675] leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <PageCTA
        title="Prefer to see the work first?"
        primary={{ to: "/products", label: "Browse products" }}
        secondary={{ to: "/work", label: "View our work" }}
      >
        Explore the full catalogue and real production photography straight from the Ortex factory floor.
      </PageCTA>
    </>
  )
}
