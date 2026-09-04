import { Box, ShoppingCart, Trash, Clock } from "iconsax-react"
import { Plus, Minus, ArrowRight, AlertTriangle } from "../../components/ui/Icons"

// Defined at module scope (never inside the page's render) so React keeps the
// same component identity across renders — otherwise the quantity <input>s
// would remount and lose focus on every keystroke.
export default function SummaryPanel({
  compact = false, step, setStep, lines, maxLeadTime, setQty, bumpQty, removeLine,
}) {
  return (
    <div className="bg-card border border-[#EBEDF3] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <ShoppingCart size={22} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
        <h2 className="text-[18px] font-semibold text-foreground">Your quote</h2>
        {lines.length > 0 && (
          <span className="ml-auto text-[12px] font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-1">
            {lines.length} item{lines.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-[#F4F6F8] grid place-items-center mx-auto mb-4 text-[#99A1B7]">
            <Box size={28} variant="Bulk" color="currentColor" aria-hidden="true" />
          </div>
          <p className="text-[15px] font-semibold text-foreground">No products yet</p>
          <p className="mt-1 text-[13px] text-[#78829D] leading-relaxed">
            Add items from the catalogue to build your quote.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {lines.map((l) => (
              <div key={l.product.id} className="border-b border-[#EBEDF3] pb-4 last:border-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-foreground leading-snug">{l.product.name}</div>
                    <div className="text-[12px] font-medium text-[#78829D] mt-0.5">MOQ {l.product.moq} {l.product.unit}</div>
                  </div>
                  <button onClick={() => removeLine(l.product.id)} aria-label={`Remove ${l.product.name}`} className="text-[#99A1B7] hover:text-destructive transition-colors shrink-0 cursor-pointer">
                    <Trash size={18} variant="Bulk" color="currentColor" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => bumpQty(l.product.id, -25)} aria-label="Decrease quantity" className="w-11 h-11 md:w-9 md:h-9 rounded-full border border-[#EBEDF3] grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number" min="0" value={l.qty}
                      onChange={(e) => setQty(l.product.id, e.target.value)}
                      className="w-12 h-11 md:h-9 text-center text-[15px] font-semibold text-foreground bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label={`Quantity for ${l.product.name}`}
                    />
                    <button onClick={() => bumpQty(l.product.id, 25)} aria-label="Increase quantity" className="w-11 h-11 md:w-9 md:h-9 rounded-full border border-[#EBEDF3] grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-[12px] font-medium text-[#78829D]">{l.product.unit}</span>
                </div>
                {l.qty > 0 && l.qty < l.product.moq && (
                  <p className="text-[11px] font-medium text-amber-500 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Below MOQ ({l.product.moq} {l.product.unit})
                  </p>
                )}
              </div>
            ))}
          </div>

          {maxLeadTime > 0 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[#F4F6F8] px-3.5 py-3">
              <Clock size={18} variant="Bulk" color="currentColor" className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-[12px] leading-snug">
                <span className="font-semibold text-foreground">Est. dispatch ~{maxLeadTime} working days</span>
                <span className="block text-[#78829D] mt-0.5">after artwork approval</span>
              </div>
            </div>
          )}

          {!compact && step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="mt-5 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3.5 font-semibold rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              Continue to details <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  )
}
