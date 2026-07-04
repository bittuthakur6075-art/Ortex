import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Terms() {
  useDocumentMetadata(
    "Terms of Service - Ortex Industries",
    "Terms of Service for Ortex Industries. Read our customer and custom manufacturing terms."
  )

  return (
    <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: July 4, 2026</p>
        
        <p className="text-foreground leading-relaxed">
          Welcome to Ortex Industries. These terms and conditions outline the rules and regulations for the use of Ortex Industries' Website, located at https://ortexindustries.in/.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Intellectual Property Rights</h2>
        <p className="text-muted-foreground leading-relaxed">
          Other than the content you own, under these Terms, Ortex Industries and/or its licensors own all the intellectual property rights and materials contained in this Website. You are granted limited license only for purposes of viewing the material contained on this Website.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Custom Manufacturing Terms</h2>
        <p className="text-muted-foreground leading-relaxed">
          All custom orders and requests placed via our website forms or direct messaging are subject to confirmation, price evaluation, and artwork approvals. We reserve the right to refuse orders that violate copyright, trademark, or contain inappropriate materials.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Limitation of Liability</h2>
        <p className="text-muted-foreground leading-relaxed">
          In no event shall Ortex Industries, nor any of its officers, directors and employees, be held liable for anything arising out of or in any way connected with your use of this Website. Ortex Industries, including its officers, directors and employees shall not be held liable for any indirect, consequential or special liability arising out of or in any way related to your use of this Website.
        </p>

        <h2 className="text-2xl font-bold pt-4 text-foreground">Contact Us</h2>
        <p className="text-muted-foreground leading-relaxed">
          If you have any questions about these Terms, please contact us at <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a>.
        </p>
      </motion.div>
    </div>
  )
}
