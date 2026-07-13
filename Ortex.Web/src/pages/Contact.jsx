import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { useSearchParams, Link } from "react-router-dom"
import { ArrowRight, Check, ChevronDown } from "lucide-react"
import { Call, Sms, Global, Clock, Airplane, ShieldTick, TickCircle } from "iconsax-react"
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

/**
 * Themed dropdown replacing the native <select>, whose option list is
 * OS-rendered and can't be styled to the brand. Click / outside-click / Escape;
 * options highlight in primary on hover and show a check when selected.
 */
function ThemedSelect({ id, value, placeholder, options, onChange, invalid }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#F9FBFC] border rounded-[20px] [corner-shape:squircle] text-left outline-none transition-colors duration-200 ${
          invalid
            ? "border-destructive"
            : open
              ? "border-primary/70 bg-white"
              : "border-[#EBEDF3] focus:border-primary/70 focus:bg-white"
        }`}
      >
        <span className={value ? "text-foreground" : "text-[#4B5675]"}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          data-lenis-prevent
          className="absolute z-30 mt-2 w-full max-h-72 overflow-auto rounded-[20px] [corner-shape:squircle] border border-[#EBEDF3] bg-white p-1.5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#EBEDF3] [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin] [scrollbar-color:#EBEDF3_transparent]"
        >
          {options.map((opt) => {
            const selected = value === opt
            return (
              <li
                key={opt}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[12px] [corner-shape:squircle] text-[16px] font-semibold cursor-pointer transition-colors duration-150 ${
                  selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10"
                }`}
              >
                {opt}
                {selected && <Check className="h-4 w-4 flex-shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

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
      cta: { label: "Chat on WhatsApp", href: whatsappLink() },
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
    "mt-1 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200"
  const labelClass = "block text-[16px] font-medium text-foreground capitalize"
  const optionalTag = <span className="font-normal text-[#78829D]"> Optional</span>
  const errorBorder = "border-destructive focus:border-destructive"

  return (
    <>
      {/* Page Header */}
      <PageHero title="We're here to help">
        Product question, custom project, or an order in motion,
        reach our team directly and a real person replies within one working day.
      </PageHero>

      {/* Full-width image strip below the hero (4:2) */}
      <section className="pb-[140px] bg-background">
        <div>
          <div className="relative aspect-[4/1] overflow-hidden">
            <img
              src="/img/contact-strip.jpg"
              alt="Laser engraving a custom design in the Ortex Industries workshop"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Form + contact channels */}
      <section className="pb-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-14 lg:gap-20">

            {/* Form Side */}
            <motion.div {...fadeUp} className="lg:order-2">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Send a message
              </span>
              <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Tell us what you need" />
              </h2>
              <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed max-w-xl">
                Share a few details about your project and our team will get back to you personally within one working day.
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className={labelClass}>Full name</label>
                    <input
                      id="name"
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Enter your full name"
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? "name-error" : undefined}
                      className={`${fieldClass} ${errors.name ? errorBorder : ""}`}
                    />
                    {errors.name && <p id="name-error" className="text-sm text-destructive mt-1.5">{errors.name}</p>}
                  </div>

                  <div>
                    <label htmlFor="email" className={labelClass}>Email</label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="Enter your email address"
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? "email-error" : undefined}
                      className={`${fieldClass} ${errors.email ? errorBorder : ""}`}
                    />
                    {errors.email && <p id="email-error" className="text-sm text-destructive mt-1.5">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="phone" className={labelClass}>Phone number</label>
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value.replace(/[^\d+\-\s()]/g, ""))}
                      placeholder="Enter your contact number"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? "phone-error" : undefined}
                      className={`${fieldClass} ${errors.phone ? errorBorder : ""}`}
                    />
                    {errors.phone && <p id="phone-error" className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
                  </div>

                  <div>
                    <label htmlFor="company" className={labelClass}>Company{optionalTag}</label>
                    <input
                      id="company"
                      type="text"
                      name="organization"
                      autoComplete="organization"
                      value={formData.company}
                      onChange={(e) => handleChange("company", e.target.value)}
                      placeholder="Enter your company name"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="productInterest" className={labelClass}>What can we make for you?</label>
                  <ThemedSelect
                    id="productInterest"
                    value={formData.productInterest}
                    placeholder="Select a product category"
                    options={productCategories}
                    onChange={(val) => handleChange("productInterest", val)}
                    invalid={Boolean(errors.productInterest)}
                  />
                  {errors.productInterest && <p className="text-sm text-destructive mt-1.5">{errors.productInterest}</p>}
                </div>

                <div>
                  <label htmlFor="message" className={labelClass}>Project details</label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    placeholder="Tell us quantities, sizes, materials, and deadlines, and share any artwork you have. The more detail, the faster we quote."
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? "message-error" : undefined}
                    className={`${fieldClass} min-h-[140px] resize-y ${errors.message ? errorBorder : ""}`}
                  />
                  {errors.message && <p id="message-error" className="text-sm text-destructive mt-1.5">{errors.message}</p>}
                </div>

                <div className="flex flex-col gap-4 items-start">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group flex-shrink-0 w-full sm:w-auto px-8 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
                  >
                    {isSubmitting ? "Sending..." : "Send my enquiry"}
                    {!isSubmitting && <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />}
                  </button>
                  <p className="text-[14px] font-normal leading-relaxed text-[#4B5675]">
                    By sending this enquiry, you agree to our{" "}
                    <Link to="/terms" className="text-primary font-medium hover:underline">Terms</Link>{" "}
                    and{" "}
                    <Link to="/privacy" className="text-primary font-medium hover:underline">Privacy Policy</Link>.
                  </p>

                  <div className="flex flex-col gap-2.5">
                    {[
                      { icon: Clock, text: "Replies within one working day, straight from our team." },
                      { icon: ShieldTick, text: "Your details stay private, never shared or sold." },
                      { icon: TickCircle, text: "No spam and no sales calls, just a straight quote." },
                    ].map(({ icon: Icon, text }) => (
                      <p key={text} className="flex items-center gap-2.5 text-[16px] font-medium text-foreground">
                        <Icon size={20} color="currentColor" variant="Bulk" className="flex-shrink-0 text-primary" aria-hidden="true" />
                        {text}
                      </p>
                    ))}
                  </div>
                </div>
              </form>
            </motion.div>

            {/* Channels Side */}
            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="lg:order-1">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Prefer to talk?
              </span>
              <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Reach us directly" />
              </h2>
              <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed">
                Pick whichever is easiest. Every message reaches our team directly, with no call centre in between.
              </p>

              <div className="mt-8 flex flex-col gap-[32px]">
                {channels.map((channel) => (
                  <div
                    key={channel.title}
                    className="flex items-start gap-5"
                  >
                    <div className="flex-shrink-0 w-[50px] h-[50px] rounded-[999px] bg-primary/10 grid place-items-center text-primary">
                      <channel.icon size={24} variant="Bulk" color="currentColor" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold uppercase tracking-[0.02em] text-[#4b5675]">{channel.title}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-1.5 text-[18px] font-semibold text-foreground">
                        {channel.details.map((detail, i) => (
                          <span key={detail.label} className="whitespace-nowrap">
                            {detail.href ? (
                              <a
                                href={detail.href}
                                target={detail.href.startsWith("http") ? "_blank" : undefined}
                                rel={detail.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                className="hover:text-primary transition-colors duration-200"
                              >
                                {detail.label}
                              </a>
                            ) : (
                              detail.label
                            )}
                            {i < channel.details.length - 1 ? "," : ""}
                          </span>
                        ))}
                      </div>
                    </div>

                    {channel.cta && (
                      <a
                        href={channel.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={channel.cta.label}
                        title={channel.cta.label}
                        className="self-center grid place-items-center flex-shrink-0 w-9 h-9 rounded-full bg-whatsapp text-white transition-all duration-200 hover:brightness-95 active:scale-[0.98]"
                      >
                        <WhatsAppIcon className="h-[18px] w-[18px] fill-current" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Location map */}
              <div className="mt-[50px] overflow-hidden rounded-[6px]">
                <iframe
                  title="Ortex Industries location on Google Maps"
                  src="https://www.google.com/maps?q=RZ-4%20Mahindra%20Park%2C%20Uttam%20Nagar%2C%20West%20Delhi%2C%20New%20Delhi%2C%20Delhi%20110059%2C%20India&output=embed"
                  className="w-full h-[300px] border-0 block"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Already know your specs — full-width image banner with overlaid copy (OEM style) */}
      <section className="py-[140px] bg-[#f9fbfc]">
        <div className="px-[50px]">
          <div className="relative aspect-[4/2] overflow-hidden">
            <img
              src="/img/contact-products.avif"
              alt="Custom lanyards, acrylic keychains, badges and MDF items made by Ortex Industries"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
            <div className="absolute inset-0 flex items-end">
              <motion.div {...fadeUp} className="w-full p-8 md:p-14">
                <span className="block text-[14px] font-semibold text-white/80 tracking-[0.22em] uppercase mb-3">
                  Have your specs ready?
                </span>
                <h2 className="max-w-3xl text-[32px] md:text-[52px] font-medium leading-[1.1] tracking-tight text-white text-balance">
                  Get a quote in minutes
                </h2>
                <p className="mt-5 max-w-3xl text-[16px] md:text-[18px] font-normal leading-relaxed text-white/80">
                  Skip the back and forth. Pick a product, set your size and quantity, and our team sends a fast, factory-direct quotation straight to you.
                </p>
                <Link
                  to="/quote"
                  className="group mt-8 inline-flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-full transition-all duration-200 active:scale-[0.98]"
                >
                  Open the quote builder
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </motion.div>
            </div>
          </div>

          {/* Three steps in one dark card, attached to the banner (OEM numbered-grid design) */}
          <motion.div
            {...fadeUp}
            className="bg-[#010101] p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-[42px]"
          >
            {[
              { title: "Pick product and material", description: "Choose from MDF, acrylic, lanyards, badges, and more." },
              { title: "Set size and quantity", description: "Enter your dimensions and how many units you need." },
              { title: "See instant pricing", description: "Get volume-tiered, factory-direct pricing on the spot." },
            ].map((step, idx) => (
              <div key={step.title}>
                <div className="mb-8 text-[36px] font-semibold leading-none text-white/40 tabular-nums">
                  0{idx + 1}
                </div>
                <h3 className="text-[24px] font-medium text-white">{step.title}</h3>
                <div className="mt-6 h-px bg-white/20" />
                <p className="mt-6 text-[16px] font-normal text-white/60 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Where we deliver */}
      <section className="py-[140px] bg-background text-center">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-14">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Delivery &amp; reach
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground lg:whitespace-nowrap">
              <RevealWords text="Delivered where you need it" />
            </h2>
            <p className="mt-5 max-w-2xl mx-auto text-[18px] font-normal text-[#4b5675] leading-relaxed">
              From a single order for a school, office, or hospital to a nationwide brand rollout, our own floor and trusted couriers get it to your door, on time.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px] text-left">
            {[
              { icon: Global, title: "PAN India delivery", description: "Every order ships from our own floor through tracked, reliable courier partners to all states and union territories. You get a dispatch update and a live tracking link, so you always know exactly where your consignment is." },
              { icon: Airplane, title: "Worldwide export", description: "Exporting abroad? We handle export documentation, customs paperwork, and secure packing from end to end, then ship through trusted freight partners so your order clears customs and arrives on time, without the usual hassle." },
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
        title="See it before you say it"
        primary={{ to: "/products", label: "Browse products" }}
        secondary={{ to: "/work", label: "View our work" }}
      >
        The full catalogue and real production shots, straight off the Ortex factory floor.
      </PageCTA>
    </>
  )
}
