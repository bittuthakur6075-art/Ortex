import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Privacy() {
  useDocumentMetadata(
    "Privacy Policy - Ortex Industries",
    "Privacy Policy for Ortex Industries. Learn how we handle customer data and form inquiries."
  )

  return (
    <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: July 4, 2026</p>
        
        <p className="text-foreground leading-relaxed">
          At Ortex Industries, we prioritize the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by Ortex Industries and how we use it.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Information We Collect</h2>
        <p className="text-muted-foreground leading-relaxed">
          If you contact us directly through our website contact form, we may receive personal details such as your name, email address, phone number, company name, the contents of the message, and any other information you choose to provide.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">How We Use Your Information</h2>
        <p className="text-muted-foreground leading-relaxed">
          We use the information we collect in various ways, including to:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Provide, operate, and maintain our website.</li>
          <li>Understand and analyze how you use our website.</li>
          <li>Communicate with you, either directly or through one of our partners, to provide you with quotes, updates, and other information relating to the website, and for marketing and promotional purposes.</li>
          <li>Process your inquiries and fulfill your customized orders.</li>
        </ul>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Contact Us</h2>
        <p className="text-muted-foreground leading-relaxed">
          If you have any questions or suggestions about our Privacy Policy, do not hesitate to contact us at <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a>.
        </p>
      </motion.div>
    </div>
  )
}
