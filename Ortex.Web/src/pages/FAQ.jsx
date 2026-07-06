import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

const faqs = [
  {
    question: "What is your Minimum Order Quantity (MOQ)?",
    answer: "Because we manufacture our products in-house, we offer flexible MOQs depending on the category. Typically, custom badges and keychains start at 100 units, lanyards and keychains start at 200 units, while customized clipboards start at 100 units. Smaller promotional sample runs can also be negotiated.",
  },
  {
    question: "Can I get a digital or physical sample before bulk order?",
    answer: "Absolutely! We provide free digital mockups (2D/3D layouts) for all clients prior to production. If your project requires a physical pre-production sample, we can manufacture and dispatch one for a nominal sampling fee, which is fully refundable upon bulk order confirmation.",
  },
  {
    question: "What design and logo file formats do you accept?",
    answer: "For high-precision UV printing and laser engraving, we prefer vector file formats like .AI, .EPS, .PDF, or .SVG. However, we also accept high-resolution raster files (.PNG or .JPG) and our design team will assist you in preparing the artwork for production.",
  },
  {
    question: "What are your standard manufacturing lead times?",
    answer: "Standard manufacturing takes 3-7 business days depending on the volume and customization complexity. We offer secure express shipping across PAN India and provide complete worldwide export support with reliable global carriers.",
  },
  {
    question: "How do I customize a product that isn't on the calculator?",
    answer: "We specialize in custom OEM and white-label manufacturing. If you need a unique size, shape, material, or branding finish, simply fill out our Contact form with your specifications, or message us directly via WhatsApp for a quick estimate.",
  },
]

export default function FAQ() {
  useDocumentMetadata(
    "Frequently Asked Questions - Ortex Industries",
    "Got questions about custom manufacturing, MOQ, sampling policies, or design files? Find answers to frequently asked questions about Ortex Industries.",
    { path: "/faq" }
  )

  const [activeFaq, setActiveFaq] = useState(null)

  return (
    <div className="bg-background min-h-screen">
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
              Frequently asked questions
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Find answers to common questions about our products, customization options, ordering processes, and shipping.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main FAQ Content */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Side: Accordion */}
            <div className="lg:col-span-7">
              <div className="space-y-1 border-t border-border">
                {faqs.map((faq, idx) => {
                  const isOpen = activeFaq === idx
                  
                  return (
                    <motion.div
                      key={faq.question}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      className="border-b border-border py-5"
                    >
                      <button
                        onClick={() => setActiveFaq(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between text-left font-bold text-foreground hover:text-primary transition-colors py-2 text-base md:text-lg gap-4"
                        aria-expanded={isOpen}
                      >
                        <span className={`${isOpen ? "text-primary" : ""}`}>{faq.question}</span>
                        {isOpen ? (
                          <Minus className="h-5 w-5 text-primary flex-shrink-0" />
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>
                      
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                          >
                            <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
                              {faq.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Right Side: Illustration */}
            <div className="lg:col-span-5 relative flex justify-center lg:justify-end lg:sticky lg:top-24">
              <div className="absolute -inset-4 bg-primary/5 rounded-3xl filter blur-2xl -z-10" />
              <div className="w-full max-w-md lg:max-w-none aspect-[4/3] rounded-3xl overflow-hidden shadow-lg border border-border bg-card">
                <img
                  src="/img/faq-illustration.jpg"
                  alt="Frequently Asked Questions Illustration"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}
