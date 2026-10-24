import { useState } from "react"
import { Plus, Minus } from "../../components/ui/Icons"

// − qty + control shared by the product cards and the summary. Steps follow
// the product's MOQ (qtyStep); stepping below 1 removes the line.
// While the field has focus it shows plain digits: re-inserting "en-IN" commas
// on every keystroke moved the caret to the end mid-edit.
export default function QtyStepper({ product, qty, setQty, bumpQty, size = "md" }) {
  const [editing, setEditing] = useState(false)
  const btn = size === "sm"
    ? "w-9 h-9"
    : "w-11 h-11 md:w-9 md:h-9"
  const shown = qty === 0 ? "" : editing ? String(qty) : qty.toLocaleString("en-IN")
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => bumpQty(product.id, -1)}
        aria-label={`Decrease quantity of ${product.name}`}
        className={`${btn} shrink-0 rounded-full border border-[#EBEDF3] bg-white grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="text" inputMode="numeric" autoComplete="off"
        value={shown}
        placeholder="0"
        maxLength={9}
        onChange={(e) => setQty(product.id, e.target.value)}
        onFocus={(e) => {
          setEditing(true)
          const el = e.target
          requestAnimationFrame(() => el.select())
        }}
        onBlur={() => setEditing(false)}
        aria-label={`Quantity of ${product.name} in ${product.unit}`}
        className={`${size === "sm" ? "w-16 h-9" : "w-[72px] h-11 md:h-9"} text-center text-[15px] font-semibold text-foreground bg-[#F9FBFC] border border-[#EBEDF3] rounded-full focus:outline-none focus:border-primary focus:bg-white tabular-nums ${qty === 0 ? "border-destructive" : ""}`}
      />
      <button type="button" onClick={() => bumpQty(product.id, 1)}
        aria-label={`Increase quantity of ${product.name}`}
        className={`${btn} shrink-0 rounded-full border border-[#EBEDF3] bg-white grid place-items-center text-[#4B5675] hover:bg-[#F4F6F8] hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
