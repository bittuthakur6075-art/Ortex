import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useSearchParams } from "react-router-dom"
import { Phone, Mail, Globe, Clock } from "lucide-react"
import { toast } from "sonner"
import { submitEnquiry } from "../lib/leads"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Contact() {
  useDocumentMetadata(
    "Contact Ortex Industries - Get Quote for Customized Products",
    "Contact Ortex Industries for customized product quotes. Call +91-9211947188, email sales@ortexindustries.in, or WhatsApp for immediate assistance. Serving India and worldwide.",
    { path: "/contact" }
  )

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    productInterest: "",
    message: ""
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

      setFormData(prev => ({
        ...prev,
        message: `Hi Ortex, I am interested in your portfolio item: "${product}". Please provide a customized quote for this product.`,
        productInterest: mapCategory(category) || prev.productInterest
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
    "Other"
  ]

  const contactCards = [
    {
      icon: Phone,
      title: "Phone",
      details: [
        { label: "+91-9211947188", href: "tel:+919211947188" },
        { label: "+91-8448663297", href: "tel:+918448663297" }
      ]
    },
    {
      icon: Mail,
      title: "Email",
      details: [
        { label: "sales@ortexindustries.in", href: "mailto:sales@ortexindustries.in" }
      ]
    },
    {
      icon: () => (
        <svg className="h-6 w-6 text-primary fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
        </svg>
      ),
      title: "WhatsApp",
      details: [
        { label: "+91-9211947188", href: "https://wa.me/919211947188" }
      ]
    },
    {
      icon: Globe,
      title: "Service areas",
      details: [
        { label: "PAN India delivery", href: null },
        { label: "Worldwide export support", href: null }
      ]
    }
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

    if (res.error) {
      toast.error("Something went wrong sending your message. Please try again or WhatsApp us.")
      return
    }
    toast.success("Message sent successfully. We will contact you soon.")
    setFormData({ name: "", email: "", phone: "", company: "", productInterest: "", message: "" })
    setErrors({})
  }

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  return (
    <>
      {/* Page Header */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Get in touch
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Have a project in mind? Contact our team to discuss your requirements and receive a customized quote for your business needs.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Content */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Form Side */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl font-bold mb-6 tracking-tight text-foreground text-balance">
                Send us a message
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Fill out the form below and our team will get back to you within 24 hours with a detailed response to your inquiry.
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Name */}
                  <div>
                    <label htmlFor="name" className="text-sm font-semibold text-foreground">Name *</label>
                    <input 
                      id="name"
                      type="text" 
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Enter your full name"
                      className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                    />
                    {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="text-sm font-semibold text-foreground">Email *</label>
                    <input 
                      id="email"
                      type="email" 
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="your.email@example.com"
                      className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                    />
                    {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Phone */}
                  <div>
                    <label htmlFor="phone" className="text-sm font-semibold text-foreground">Phone *</label>
                    <input 
                      id="phone"
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      placeholder="+91-XXXXXXXXXX"
                      className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                    />
                    {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
                  </div>

                  {/* Company */}
                  <div>
                    <label htmlFor="company" className="text-sm font-semibold text-foreground">Company</label>
                    <input 
                      id="company"
                      type="text" 
                      value={formData.company}
                      onChange={(e) => handleChange("company", e.target.value)}
                      placeholder="Your company name"
                      className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground"
                    />
                  </div>

                </div>

                {/* Product Interest Select */}
                <div>
                  <label htmlFor="productInterest" className="text-sm font-semibold text-foreground">Product interest *</label>
                  <select 
                    id="productInterest"
                    value={formData.productInterest}
                    onChange={(e) => handleChange("productInterest", e.target.value)}
                    className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none transition-all duration-200 text-foreground cursor-pointer"
                  >
                    <option value="">Select a product category</option>
                    {productCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.productInterest && <p className="text-sm text-destructive mt-1">{errors.productInterest}</p>}
                </div>

                {/* Message Textarea */}
                <div>
                  <label htmlFor="message" className="text-sm font-semibold text-foreground">Message *</label>
                  <textarea 
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    placeholder="Tell us about your requirements..."
                    className="mt-2 w-full px-4 py-3 bg-card border border-border/80 focus:border-primary rounded-lg focus:outline-none min-h-[120px] transition-all duration-200 text-foreground"
                  />
                  {errors.message && <p className="text-sm text-destructive mt-1">{errors.message}</p>}
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full md:w-auto px-6 py-3 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {isSubmitting ? "Sending..." : "Send message"}
                </button>

              </form>
            </motion.div>

            {/* Info Side */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <h2 className="text-3xl font-bold mb-6 tracking-tight text-foreground text-balance">
                Contact information
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Reach out to us directly through any of the following channels. We are here to help you with your customized product requirements.
              </p>

              <div className="space-y-6">
                {contactCards.map((card, idx) => (
                  <div key={idx} className="bg-muted rounded-xl p-6 border border-border/40">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          {typeof card.icon === "function" ? <card.icon /> : <card.icon className="h-6 w-6 text-primary" />}
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2 text-foreground">{card.title}</h3>
                        <div className="space-y-1">
                          {card.details.map((detail, dIdx) => (
                            <div key={dIdx}>
                              {detail.href ? (
                                <a 
                                  href={detail.href} 
                                  target={detail.href.startsWith("http") ? "_blank" : undefined}
                                  rel={detail.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                  className="text-sm text-muted-foreground hover:text-primary transition-all duration-200"
                                >
                                  {detail.label}
                                </a>
                              ) : (
                                <p className="text-sm text-muted-foreground">{detail.label}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Business Hours Box */}
                <div className="bg-primary/5 rounded-xl p-6 border border-primary/20">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2 text-foreground">Business hours</h3>
                      <p className="text-sm text-muted-foreground">Monday - Saturday: 9:00 AM - 6:00 PM</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Sunday: Closed</p>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Global Services Section */}
      <section className="py-20 bg-secondary text-center">
        <div className="lp-wrap">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Serving customers worldwide
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              With comprehensive PAN India delivery network and global export capabilities, we serve businesses across India and worldwide. Our logistics partners ensure timely delivery of your orders, no matter where you are located.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="bg-card border border-border/50 rounded-xl p-6 shadow-md">
                <Globe className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-foreground">India</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Complete PAN India delivery with reliable logistics partners ensuring timely delivery across all states
                </p>
              </div>
              <div className="bg-card border border-border/50 rounded-xl p-6 shadow-md">
                <Globe className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-foreground">International</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Worldwide export support with comprehensive documentation and shipping assistance
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
