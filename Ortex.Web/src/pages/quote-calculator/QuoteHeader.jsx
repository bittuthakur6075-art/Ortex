import { Box, ReceiptText, Building3, ShieldTick } from "iconsax-react"

// Truthful reassurance shown under the header. No pricing is shown anywhere on
// this page — customers receive a formal quotation from the sales desk.
const TRUST = [
  { icon: Building3, label: "100% in-house manufacturing" },
  { icon: Box, label: "Bulk & wholesale supply" },
  { icon: ReceiptText, label: "Formal GST quotation" },
  { icon: ShieldTick, label: "No obligation" },
]

export default function QuoteHeader() {
  return (
    <>
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-8">
        <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
          Get a quote
        </span>
        <h1 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground">
          Build your custom quote
        </h1>
        <p className="mt-5 text-[18px] font-normal text-muted-foreground leading-relaxed">
          Add the products you need, set your quantities, and submit your request. Our sales desk will send a
          formal GST quotation tailored to your specs and volumes.
        </p>
      </div>

      {/* Trust row */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mb-12">
        {TRUST.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <t.icon size={18} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
            {t.label}
          </span>
        ))}
      </div>
    </>
  )
}
