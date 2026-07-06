import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Cookies() {
  useDocumentMetadata(
    "Cookie Policy - Ortex Industries",
    "Cookie Policy for Ortex Industries. Learn how we use cookies and tracking technologies to improve our platform.",
    { path: "/cookies" }
  )

  const cookieInfo = [
    {
      title: "1. What Are Cookies?",
      content: "Cookies are small text files stored on your computer or mobile device when you visit a website. They are widely used to make websites work, enable features like session logs, and provide analytical data to website owners."
    },
    {
      title: "2. How We Use Cookies",
      content: "Ortex Industries uses cookies to enhance your experience. Specifically, they help us remember your layout preferences, auto-fill contact fields on subsequent inquiries, keep your session authenticated (where applicable), and gather statistical data on site usage so we can optimize load times."
    },
    {
      title: "3. Types of Cookies We Use",
      content: "We use both session cookies (which expire when you close your browser) and persistent cookies (which remain on your device for a set period). They fall into these categories: (a) Essential Cookies: Necessary for basic site rendering and security; (b) Performance & Analytics: Helping us analyze aggregate traffic behavior using services like Google Analytics."
    },
    {
      title: "4. Controlling Cookie Preferences",
      content: "You can control or block cookies through your browser settings. Most browsers allow you to refuse cookies, delete existing cookies, or receive a warning before a cookie is stored. Note that disabling essential cookies may impact the functionality and responsiveness of our quote forms and calculators."
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Cookie Policy</h1>
          <p className="mt-2 text-muted-foreground">Last updated: July 4, 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          This Cookie Policy explains how Ortex Industries uses cookies and similar tracking technologies 
          to improve your browsing experience and analyze platform performance.
        </p>

        <div className="space-y-6">
          {cookieInfo.map((item) => (
            <div key={item.title} className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-3">{item.title}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {item.content}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">5. Policy Updates and Contact</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            We may update this policy periodically to reflect changes in our technology or compliance guidelines. For inquiries regarding cookie usage, contact:
          </p>
          <div className="bg-secondary p-4 rounded-lg border border-border text-sm">
            <p className="font-semibold text-foreground">Ortex Industries Compliance Group</p>
            <p className="text-muted-foreground mt-1">Email: <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a></p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
