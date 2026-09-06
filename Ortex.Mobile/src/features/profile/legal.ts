/**
 * The Privacy Policy and Terms of Service, WORD FOR WORD from the website.
 *
 * MIRROR OF Ortex.Web/src/pages/Privacy.jsx and Ortex.Web/src/pages/Terms.jsx —
 * edit both sides. These are the published legal terms of one company: a phone
 * that paraphrases them, or lags a revision behind, is a second set of terms
 * nobody agreed to. The wording, the section numbers and the "Last updated" date
 * below are the site's, copied rather than summarised, and a change on the site
 * has to be brought here in the same commit.
 *
 * It is a local constant rather than a WebView pointed at ortexindustries.in
 * because a salesperson standing in a customer's warehouse on no signal must
 * still be able to open the terms they are quoting under.
 */

export type LegalDoc = {
  title: string
  updated: string
  intro: string
  sections: { title: string; content: string }[]
  contact: {
    title: string
    note?: string
    org: string
    email: string
    address?: string
  }
}

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: July 4, 2026",
  intro:
    "At Ortex Industries, we prioritize the protection and confidentiality of our clients' data. This Privacy Policy outlines how we collect, store, share, and protect your personal information and custom product assets when you interact with our website, use our quote tools, or procure custom manufacturing services from us.",
  sections: [
    {
      title: "1. Information We Collect",
      content:
        "We collect information you provide directly to us when requesting custom quotes, placing orders, or contacting our support team. This includes personal identification information (such as your name, email address, corporate domain, phone number, and shipping address), business details (such as company name, tax registration/GST numbers), and custom manufacturing assets (such as logos, vector designs, and product specifications).",
    },
    {
      title: "2. How We Use Your Information",
      content:
        "We process your information to fulfill our manufacturing obligations and provide high-quality customized services. Specifically, we use your data to generate accurate price estimates via our quote calculator, coordinate pre-production artwork approvals, process bulk payments, manage shipping logistics via our courier networks, and send order status updates. We also analyze site usage to improve page speed and user experience.",
    },
    {
      title: "3. Data Sharing and Third-Party Disclosures",
      content:
        "Ortex Industries does not sell, lease, or trade your personal data. We share information only with the providers necessary to run this website and complete your order. Named processors: Supabase (cloud database and file storage for enquiries and uploaded artwork) and, where you have consented to analytics, ipapi.co with api.ipify.org as fallback (IP-address geolocation lookup). We additionally share order data with logistics partners for PAN India and global shipping. We do not use Google Analytics, advertising pixels, or retargeting networks of any kind.",
    },
    {
      title: "4. Analytics, IP Address, and Consent",
      content:
        "We collect page-visit records containing your device type, browser, operating system, and referring site. If — and only if — you accept analytics on our consent banner, these records additionally include your public IP address and the approximate city, region, and country derived from it by ipapi.co. Declining means no request is sent to ipapi.co and no IP address or location is stored. You can withdraw consent at any time by clearing this site's browser storage. See our Cookie Policy for the precise list of what is stored in your browser.",
    },
    {
      title: "5. Intellectual Property and Asset Retention",
      content:
        "Custom design files, brand logos, and artwork templates uploaded through our platform are retained solely for the purpose of executing your production orders and enabling convenient re-ordering. We implement access control systems to ensure your proprietary designs are restricted to authorized design and manufacturing staff.",
    },
    {
      title: "6. Security Standards",
      content:
        "We implement robust technical and organizational security measures to prevent unauthorized access, alteration, disclosure, or destruction of your personal details and custom assets. This includes secure data transmission protocols (HTTPS), server-side encryption, and regular vulnerability checks on our local network infrastructures.",
    },
    {
      title: "7. Your Global Rights (GDPR / CCPA / DPDP)",
      content:
        "Depending on your location, you hold legal rights regarding your personal data. This includes the right to request a copy of your records, request the rectification of incorrect details, withdraw consent for marketing communications, or demand the deletion of your account history (subject to legal or tax audit retention requirements). To exercise these rights, contact us directly at our compliance email.",
    },
  ],
  contact: {
    title: "8. Contact Information",
    note: "For questions about this policy, data removal requests, or privacy concerns, please contact our data team at:",
    org: "Ortex Industries Compliance Office",
    email: "sales@ortexindustries.in",
    address: "Custom Manufacturing Division, New Delhi, India",
  },
}

export const TERMS: LegalDoc = {
  title: "Terms of Service",
  updated: "Last updated: July 4, 2026",
  intro:
    "These Terms of Service govern your use of the Ortex Industries website and custom manufacturing services. Please review them carefully. Placements of corporate orders or artwork approvals imply full acceptance of these terms.",
  sections: [
    {
      title: "1. Acceptance of Terms",
      content:
        "By accessing this website, submitting requests via our custom product forms, or placing custom manufacturing orders, you agree to comply with and be bound by these Terms of Service. If you do not agree, you must cease all website and service usage immediately.",
    },
    {
      title: "2. Custom Manufacturing & Design Approval",
      content:
        "All custom manufacturing requests are subject to verification. Before production begins, you must sign off on a digital pre-production proof (mockup). Ortex Industries is not liable for errors in the finished product if they conform to the approved mockup. Once approved, changes to designs may incur additional setup fees and reset production lead times.",
    },
    {
      title: "3. Turnaround Times & Logistics",
      content:
        "Estimated manufacturing turnaround times and delivery schedules are provided as guidelines and may vary based on materials, complexity, and order volume. While we strive to meet all deadlines, Ortex Industries is not liable for indirect losses or shipping delays caused by carrier networks or customs clearances for worldwide exports.",
    },
    {
      title: "4. Payment & Cancellation Policy",
      content:
        "Due to the custom nature of our products, orders typically require an advance deposit before setup and production. Balances must be cleared prior to dispatch. Once production setup or manufacturing begins, deposits are non-refundable and orders cannot be canceled. Custom molds or tooling developed remain the property of Ortex Industries unless contractually specified otherwise.",
    },
    {
      title: "5. Intellectual Property Indemnification",
      content:
        "You warrant that you own or possess the legal rights/trademarks for all graphics, logos, slogans, and artwork uploaded for custom product fabrication. You agree to fully indemnify, defend, and hold harmless Ortex Industries and its affiliates from any claims, lawsuits, or damages arising from copyright or trademark infringement assertions related to assets you provided.",
    },
    {
      title: "6. Limitation of Liability",
      content:
        "In no event shall Ortex Industries be liable for any indirect, special, punitive, incidental, or consequential damages (including lost profits or business interruptions) arising from product delays, defective units, or website outages. Our total liability under any claim shall not exceed the amount paid for the specific order under dispute.",
    },
  ],
  contact: {
    title: "7. Governance & Contact",
    note: "These terms are governed by the laws of India. Any disputes arising shall be subject to the exclusive jurisdiction of the courts of New Delhi.",
    org: "Ortex Industries Operations",
    email: "sales@ortexindustries.in",
  },
}

export const LEGAL_DOCS = { privacy: PRIVACY, terms: TERMS } as const

export type LegalDocKey = keyof typeof LEGAL_DOCS
