import { Box, ReceiptText, Building3, ShieldTick } from "iconsax-react"

// Truthful reassurance shown under the header. No pricing is shown anywhere on
// this page: customers receive a formal quotation from the sales desk.
const TRUST = [
  { icon: Building3, label: "100% in-house manufacturing" },
  { icon: Box, label: "Bulk & wholesale supply" },
  { icon: ReceiptText, label: "Formal GST quotation" },
  { icon: ShieldTick, label: "No obligation" },
]

// Kept short so the first row of products shows above the fold on a laptop.
export default function QuoteHeader() {
  return (
    <div className="text-center max-w-3xl mx-auto mb-6">
      <span className="block text-[13px] font-semibold uppercase tracking-[0.22em] text-primary mb-2">
        Get a quote
      </span>
      <h1 className="text-[32px] md:text-[44px] font-normal leading-[1.1] tracking-tight text-foreground">
        Build your custom quote
      </h1>
      <p className="mt-3 text-[16px] md:text-[17px] font-normal text-muted-foreground leading-relaxed">
        Add products, set quantities, and our sales desk sends a formal GST quotation.
      </p>
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {TRUST.map((t) => (
          <li key={t.label} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <t.icon size={16} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
            {t.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
