import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

const acceptableSchemas = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://www.ortexindustries.in/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Acceptable Use Policy",
        "item": "https://www.ortexindustries.in/acceptable-use"
      }
    ]
  }
]

export default function AcceptableUse() {
  useDocumentMetadata(
    "Acceptable Use Policy — Ortex Industries",
    "Read the Acceptable Use Policy of Ortex Industries. Understand the guidelines and restrictions for using our customization services and website.",
    { 
      path: "/acceptable-use",
      keywords: "acceptable use policy, branding guidelines, content restrictions",
      schemas: acceptableSchemas
    }
  )

  const rules = [
    {
      title: "1. Upload Guidelines for Custom Designs",
      content: "When uploading graphics, text, or brand assets for custom manufacturing (corporate gifting, OEM, packaging, etc.), you agree that you will not submit any content that: (a) Infringes upon copyrights, trademarks, design patents, or proprietary rights of third parties; (b) Contains offensive, defamatory, hateful, or discriminatory imagery or text; (c) Violates any local or international laws or regulations."
    },
    {
      title: "2. Prohibited Platform Activities",
      content: "You are prohibited from: (a) Running automated scripts, bots, or scrapers on our price calculators; (b) Attempting to bypass security barriers or exploit vulnerabilities; (c) Injecting malicious code, viruses, or trojan horses into our forms or upload tools."
    },
    {
      title: "3. Compliance & Design Review",
      content: "Ortex Industries maintains sole discretion to review all custom artwork uploads. We reserve the right to cancel any order or refuse production of any design we determine violates these terms or conflicts with our corporate compliance policies."
    },
    {
      title: "4. Reporting Violations",
      content: "If you believe any user is violating this policy or uploading designs that infringe on your intellectual property, please report the incident to our compliance team with supporting documentation."
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Acceptable Use Policy</h1>
          <p className="mt-2 text-muted-foreground">Last updated: July 4, 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          This Acceptable Use Policy defines the standards and restrictions for uploading custom designs 
          and interacting with the Ortex Industries website and manufacturing services.
        </p>

        <div className="space-y-6">
          {rules.map((rule) => (
            <div key={rule.title} className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-3">{rule.title}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {rule.content}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">5. Enforcement</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Violations of this policy may result in immediate order cancellation, withholding of production deposits, and restrictions on future business relations.
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
