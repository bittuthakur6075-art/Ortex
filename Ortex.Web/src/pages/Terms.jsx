import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Terms() {
  useDocumentMetadata(
    "Terms of Service - Ortex Industries",
    "Terms of Service for Ortex Industries. Read our customer agreements and custom manufacturing terms.",
    { path: "/terms" }
  )

  const terms = [
    {
      title: "1. Acceptance of Terms",
      content: "By accessing this website, submitting requests via our custom product forms, or placing custom manufacturing orders, you agree to comply with and be bound by these Terms of Service. If you do not agree, you must cease all website and service usage immediately."
    },
    {
      title: "2. Custom Manufacturing & Design Approval",
      content: "All custom manufacturing requests are subject to verification. Before production begins, you must sign off on a digital pre-production proof (mockup). Ortex Industries is not liable for errors in the finished product if they conform to the approved mockup. Once approved, changes to designs may incur additional setup fees and reset production lead times."
    },
    {
      title: "3. Turnaround Times & Logistics",
      content: "Estimated manufacturing turnaround times and delivery schedules are provided as guidelines and may vary based on materials, complexity, and order volume. While we strive to meet all deadlines, Ortex Industries is not liable for indirect losses or shipping delays caused by carrier networks or customs clearances for worldwide exports."
    },
    {
      title: "4. Payment & Cancellation Policy",
      content: "Due to the custom nature of our products, orders typically require an advance deposit before setup and production. Balances must be cleared prior to dispatch. Once production setup or manufacturing begins, deposits are non-refundable and orders cannot be canceled. Custom molds or tooling developed remain the property of Ortex Industries unless contractually specified otherwise."
    },
    {
      title: "5. Intellectual Property Indemnification",
      content: "You warrant that you own or possess the legal rights/trademarks for all graphics, logos, slogans, and artwork uploaded for custom product fabrication. You agree to fully indemnify, defend, and hold harmless Ortex Industries and its affiliates from any claims, lawsuits, or damages arising from copyright or trademark infringement assertions related to assets you provided."
    },
    {
      title: "6. Limitation of Liability",
      content: "In no event shall Ortex Industries be liable for any indirect, special, punitive, incidental, or consequential damages (including lost profits or business interruptions) arising from product delays, defective units, or website outages. Our total liability under any claim shall not exceed the amount paid for the specific order under dispute."
    }
  ]

  return (
    <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-2 text-muted-foreground">Last updated: July 4, 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          These Terms of Service govern your use of the Ortex Industries website and custom manufacturing 
          services. Please review them carefully. Placements of corporate orders or artwork approvals 
          imply full acceptance of these terms.
        </p>

        <div className="space-y-6">
          {terms.map((term) => (
            <div key={term.title} className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-3">{term.title}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {term.content}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">7. Governance & Contact</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            These terms are governed by the laws of India. Any disputes arising shall be subject to the exclusive jurisdiction of the courts of New Delhi.
          </p>
          <div className="bg-secondary p-4 rounded-lg border border-border text-sm">
            <p className="font-semibold text-foreground">Ortex Industries Operations</p>
            <p className="text-muted-foreground mt-1">Email: <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a></p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
