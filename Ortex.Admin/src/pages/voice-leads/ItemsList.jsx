import { Package } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"

// The order itself. A cross-sell the customer accepted is a line on this list,
// not a footnote in the summary, so every item gets its own row with its own
// quantity and a visible gap where a quantity is still missing.
export default function ItemsList({ items, dense = false }) {
  if (!items.length) {
    return (
      <div className="flex gap-2.5 text-sm text-muted-foreground">
        <Package className="mt-0.5 h-4 w-4 flex-none" />
        <span>No product captured on this call</span>
      </div>
    )
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        {items.length === 1 ? "Product" : `Order, ${items.length} items`}
      </div>
      <ul className={cn("space-y-1", dense && "space-y-0.5")}>
        {items.map((it, i) => (
          <li key={`${it.product}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 font-medium text-foreground">
              {it.product}
              {it.notes && <span className="ml-1 font-normal text-muted-foreground">({it.notes})</span>}
            </span>
            {it.quantity ? (
              <span className="tabular flex-none font-semibold text-foreground">{it.quantity}</span>
            ) : (
              <span className="flex-none text-xs font-medium text-warning-text">Qty missing</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
