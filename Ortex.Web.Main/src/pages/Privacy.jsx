import useDocumentMetadata from "../hooks/useDocumentMetadata"
import LegalPage from "../components/ui/LegalPage"
import { CONTACT, ADDRESS_LINE } from "../constants/site"

// Written for THIS site, which has no analytics, no cookies and no voice
// assistant. Ortex.Web's policy (mirrored in the Mobile app) covers those; do
// not copy its sections here unless this site gains the same features.
const SECTIONS = [
  {
    title: "Who we are",
    body: [
      `ortexindustries.in is run by Ortex Industries Private Limited, ${ADDRESS_LINE}, India. Questions about this policy go to ${CONTACT.email}.`,
    ],
  },
  {
    title: "What we collect",
    body: [
      "When you send the contact form we receive your name, email address, phone number, company (if you give one), the product category you choose and your message. We also receive anything you tell us by phone, email or WhatsApp.",
      "This website does not use analytics, advertising pixels or tracking cookies, and it does not record which pages you visit.",
    ],
  },
  {
    title: "Why we use it",
    body: [
      "We use your details only to answer your enquiry: to prepare a quotation, ask about your requirement, and, if you order, to produce, invoice and deliver it. We do not send marketing messages unless you ask us to.",
    ],
  },
  {
    title: "Where it is stored and who processes it",
    body: [
      "Form enquiries are stored in our customer database, hosted by Supabase, and are visible only to Ortex staff who handle enquiries. The website itself is hosted by Hostinger. For an order, we share delivery details with our courier partners.",
      "We do not sell, rent or trade your personal information.",
    ],
  },
  {
    title: "Your browser",
    body: [
      "If an enquiry cannot reach our server when you send it, it is kept in your browser's local storage and sent automatically the next time you open the site. Nothing else is stored in your browser. Clearing this site's data removes it.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "Enquiries are kept for as long as they are useful for following up and for repeat orders. Records linked to an invoice are kept for the period Indian tax law requires.",
    ],
  },
  {
    title: "Your rights",
    body: [
      `You can ask us for a copy of the details we hold about you, ask us to correct them, or ask us to delete them where we are not required to keep them. Write to ${CONTACT.email} and we will respond within 30 days.`,
    ],
  },
  {
    title: "Changes",
    body: ["If we change this policy we will update this page and the date above."],
  },
]

export default function Privacy() {
  useDocumentMetadata(
    "Privacy Policy | Ortex Industries",
    "What Ortex Industries collects when you contact us through ortexindustries.in, why we keep it, who processes it and how to ask for it to be deleted.",
    { path: "/privacy" }
  )

  return (
    <LegalPage
      title="Privacy policy"
      updated="17 October 2026"
      intro="What we collect when you contact us through this website, and what we do with it."
      sections={SECTIONS}
    />
  )
}
