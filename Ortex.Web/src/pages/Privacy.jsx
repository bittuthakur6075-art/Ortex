import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Privacy() {
  useDocumentMetadata(
    "Privacy Policy - Ortex Industries",
    "Privacy Policy for Ortex Industries. Learn how we handle customer data, custom manufacturing records, and form inquiries.",
    { path: "/privacy" }
  )

  const sections = [
    {
      title: "1. Information We Collect",
      content: "We collect information you provide directly to us when requesting custom quotes, placing orders, or contacting our support team. This includes personal identification information (such as your name, email address, corporate domain, phone number, and shipping address), business details (such as company name, tax registration/GST numbers), and custom manufacturing assets (such as logos, vector designs, and product specifications)."
    },
    {
      title: "2. How We Use Your Information",
      content: "We process your information to fulfill our manufacturing obligations and provide high-quality customized services. Specifically, we use your data to generate accurate price estimates via our quote calculator, coordinate pre-production artwork approvals, process bulk payments, manage shipping logistics via our courier networks, and send order status updates. We also analyze site usage to improve page speed and user experience."
    },
    {
      title: "3. Data Sharing and Third-Party Disclosures",
      content: "Ortex Industries does not sell, lease, or trade your personal data. We share information only with the providers necessary to run this website and complete your order. Named processors: Supabase (cloud database and file storage for enquiries and uploaded artwork) and, where you have consented to analytics, ipapi.co with api.ipify.org as fallback (IP-address geolocation lookup). We additionally share order data with logistics partners for PAN India and global shipping. We do not use Google Analytics, advertising pixels, or retargeting networks of any kind."
    },
    {
      title: "4. Analytics, IP Address, and Consent",
      content: "We collect page-visit records containing your device type, browser, operating system, and referring site. If — and only if — you accept analytics on our consent banner, these records additionally include your public IP address and the approximate city, region, and country derived from it by ipapi.co. Declining means no request is sent to ipapi.co and no IP address or location is stored. You can withdraw consent at any time by clearing this site's browser storage. See our Cookie Policy for the precise list of what is stored in your browser."
    },
    {
      title: "5. Intellectual Property and Asset Retention",
      content: "Custom design files, brand logos, and artwork templates uploaded through our platform are retained solely for the purpose of executing your production orders and enabling convenient re-ordering. We implement access control systems to ensure your proprietary designs are restricted to authorized design and manufacturing staff."
    },
    {
      title: "6. Security Standards",
      content: "We implement robust technical and organizational security measures to prevent unauthorized access, alteration, disclosure, or destruction of your personal details and custom assets. This includes secure data transmission protocols (HTTPS), server-side encryption, and regular vulnerability checks on our local network infrastructures."
    },
    {
      title: "7. Your Global Rights (GDPR / CCPA / DPDP)",
      content: "Depending on your location, you hold legal rights regarding your personal data. This includes the right to request a copy of your records, request the rectification of incorrect details, withdraw consent for marketing communications, or demand the deletion of your account history (subject to legal or tax audit retention requirements). To exercise these rights, contact us directly at our compliance email."
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-muted-foreground">Last updated: July 4, 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          At Ortex Industries, we prioritize the protection and confidentiality of our clients' data. 
          This Privacy Policy outlines how we collect, store, share, and protect your personal information 
          and custom product assets when you interact with our website, use our quote tools, or procure 
          custom manufacturing services from us.
        </p>

        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-3">{section.title}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">8. Contact Information</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            For questions about this policy, data removal requests, or privacy concerns, please contact our data team at:
          </p>
          <div className="bg-secondary p-4 rounded-lg border border-border text-sm">
            <p className="font-semibold text-foreground">Ortex Industries Compliance Office</p>
            <p className="text-muted-foreground mt-1">Email: <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a></p>
            <p className="text-muted-foreground">Address: Custom Manufacturing Division, New Delhi, India</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
