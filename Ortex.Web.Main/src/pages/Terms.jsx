import useDocumentMetadata from "../hooks/useDocumentMetadata"
import LegalPage from "../components/ui/LegalPage"
import { CONTACT } from "../constants/site"

const SECTIONS = [
  {
    title: "About these terms",
    body: [
      "These terms cover your use of ortexindustries.in and any quotation or order you place with Ortex Industries Private Limited. A signed quotation or purchase order with different terms takes precedence over this page for that order.",
    ],
  },
  {
    title: "Website content",
    body: [
      "Product descriptions and photos show work we have made and are a guide only. Colours on screen, sizes and finishes can differ slightly from the final product. Your quotation and the proof you approve set the actual specification.",
    ],
  },
  {
    title: "Quotations",
    body: [
      "Quotations are based on the quantity, specification and artwork you give us, and include GST as stated on the quotation. A change to any of these may change the price or the delivery date.",
    ],
  },
  {
    title: "Artwork and approval",
    body: [
      "Before production we send a proof for your approval. Production starts only after you approve it, and we produce exactly what you approve, so please check spelling, colours and dimensions carefully.",
      "By sending artwork you confirm that you have the right to use every logo, trademark and image in it. We may decline artwork that is unlawful or that we believe infringes someone else's rights.",
    ],
  },
  {
    title: "Payment",
    body: [
      "Payment terms are stated on your quotation or invoice. Customised orders usually need an advance before production. Every invoice is a GST invoice.",
    ],
  },
  {
    title: "Delivery",
    body: [
      "Dispatch dates start from proof approval and advance payment. We ship through courier and freight partners across India and abroad and share tracking once the order leaves our floor. Delays caused by carriers or events outside our control do not make us liable for losses beyond the order value.",
    ],
  },
  {
    title: "Defects and returns",
    body: [
      "Because every order is made to your specification, it cannot be returned for a change of mind. If something arrives damaged or does not match the approved proof, tell us within 7 days of delivery with photos and we will repair, replace or credit the affected pieces.",
    ],
  },
  {
    title: "Governing law",
    body: [
      `These terms are governed by the laws of India, and the courts of New Delhi have jurisdiction. Questions about these terms go to ${CONTACT.email}.`,
    ],
  },
]

export default function Terms() {
  useDocumentMetadata(
    "Terms of Service | Ortex Industries",
    "The terms for using ortexindustries.in and for quotations and customised orders with Ortex Industries, including artwork approval, payment and delivery.",
    { path: "/terms" }
  )

  return (
    <LegalPage
      title="Terms of service"
      updated="17 October 2026"
      intro="The terms for using this website and for quotations and orders with Ortex Industries."
      sections={SECTIONS}
    />
  )
}
