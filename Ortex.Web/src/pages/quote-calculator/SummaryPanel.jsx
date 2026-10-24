import { Box, ShoppingCart, Trash, Clock } from "iconsax-react"
import { ArrowRight, AlertTriangle } from "../../components/ui/Icons"
import { useRef } from "react"
import QtyStepper from "./QtyStepper"
import { keepFocusIn } from "./helpers"

// Defined at module scope (never inside the page's render) so React keeps the
// same component identity across renders, otherwise the quantity <input>s
// would remount and lose focus on every keystroke.
export default function SummaryPanel({
  compact = false, step, onContinue, lines, maxLeadTime, setQty, bumpQty, removeLine, bare = false,
}) {
  // A removed line takes its focused button with it; keep focus in the panel.
  const panelRef = useRef(null)
  const remove = (id) => { removeLine(id); keepFocusIn(panelRef.current) }
  const bump = (id, dir) => { bumpQty(id, dir); keepFocusIn(panelRef.current) }
  return (
    <div ref={panelRef} className={bare ? "" : "bg-card border border-[#EBEDF3] rounded-2xl p-6"}>
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
          <p className="mt-1 text-[13px] text-[#636c85] leading-relaxed">
            Add items from the catalogue to build your quote.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {lines.map((l) => (
              <li key={l.product.id} className="border-b border-[#EBEDF3] pb-4 last:border-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-foreground leading-snug">{l.product.name}</div>
                    <div className="text-[12px] font-medium text-[#636c85] mt-0.5">MOQ {l.product.moq} {l.product.unit}</div>
                  </div>
                  <button type="button" onClick={() => remove(l.product.id)} aria-label={`Remove ${l.product.name}`}
                    className="w-9 h-9 -mr-2 -mt-1 grid place-items-center rounded-full text-[#99A1B7] hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive">
                    <Trash size={18} variant="Bulk" color="currentColor" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <QtyStepper product={l.product} qty={l.qty} setQty={setQty} bumpQty={bump} />
                  <span className="text-[12px] font-medium text-[#636c85]">{l.product.unit}</span>
                </div>
                {l.qty === 0 ? (
                  <p className="text-[12px] font-medium text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Enter a quantity, or remove this item
                  </p>
                ) : l.qty < l.product.moq && (
                  <p className="text-[12px] font-medium text-amber-700 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Below MOQ ({l.product.moq} {l.product.unit})
                  </p>
                )}
              </li>
            ))}
          </ul>

          {maxLeadTime > 0 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[#F4F6F8] px-3.5 py-3">
              <Clock size={18} variant="Bulk" color="currentColor" className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-[12px] leading-snug">
                <span className="font-semibold text-foreground">Est. dispatch ~{maxLeadTime} working days</span>
                <span className="block text-[#636c85] mt-0.5">after artwork approval</span>
              </div>
            </div>
          )}

          {!compact && step === 1 && (
            <button
              type="button"
              onClick={onContinue}
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
