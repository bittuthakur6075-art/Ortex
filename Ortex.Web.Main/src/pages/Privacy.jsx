import useDocumentMetadata from "../hooks/useDocumentMetadata"
import LegalPage from "../components/ui/LegalPage"
import { CONTACT, ADDRESS_LINE } from "../constants/site"

// Written for THIS site: the contact form and Anu, the voice assistant. It has
// no analytics or cookies; Ortex.Web's policy (mirrored in the Mobile app)
// covers those, so do not copy its sections here unless this site gains them.
// Anu's disclosure matches what she does (components/ui/live-orty): Gemini
// processes the call live, the call is recorded, and a recording is kept only
// when the call produced an enquiry.
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
    title: "Alisha, our voice assistant",
    body: [
      "Alisha is an AI voice assistant that can call you through this website. She asks for your microphone first, and the call starts only if you allow it. She says at the start that the call is recorded.",
      "During the call your voice and the conversation are processed in real time by Google's Gemini service to produce her spoken replies. The details you give her, such as your name, WhatsApp number, the products and quantities you ask about, your timeline and delivery city, are saved as an enquiry.",
      "When you start a call with Alisha, Cloudflare Turnstile checks your browser to keep out automated abuse, and processes technical signals such as your IP address and browser characteristics under Cloudflare's privacy policy.",
      "The call is recorded as an audio file. A recording is kept only when the call produced an enquiry; it is stored privately, opened only by Ortex staff who handle enquiries, and used to follow up your requirement accurately and to check the assistant's quality.",
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
      "Form and voice enquiries, and call recordings, are stored in our customer database and file storage, hosted by Supabase, and are visible only to Ortex staff who handle enquiries. Voice calls are processed by Google (Gemini) while they take place, and Cloudflare (Turnstile) checks the browser when a call starts. The website itself is hosted by Hostinger. For an order, we share delivery details with our courier partners.",
      "We do not sell, rent or trade your personal information.",
    ],
  },
  {
    title: "Your browser",
    body: [
      "If an enquiry cannot reach our server when you send it, it is kept in your browser's local storage and sent automatically the next time you open the site.",
      "So that Alisha can continue where you left off, a short note of your call (the details you gave and the last few lines of the conversation) is kept in your browser's session storage for up to two hours and is deleted when you close the tab. A marker there also stops her calling you automatically more than once per visit.",
      "Nothing else is stored in your browser. Clearing this site's data removes all of it.",
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
    "What Ortex Industries collects through its contact form and voice assistant on ortexindustries.in, who processes it, and how to have it deleted.",
    { path: "/privacy" }
  )

  return (
    <LegalPage
      title="Privacy policy"
      updated="24 October 2026"
      intro="What we collect when you contact us through this website or speak with our voice assistant, and what we do with it."
      sections={SECTIONS}
    />
  )
}
