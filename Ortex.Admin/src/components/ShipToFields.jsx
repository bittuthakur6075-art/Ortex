import CustomerFields from "./CustomerFields"
import { newCustomer } from "../data/schema"

// Optional consignee (ship-to) block. When "same as billing" is checked, the
// value is null and the document ships to the bill-to party. Unchecking reveals
// a full address form. The ship-to state drives the GST place of supply.
export default function ShipToFields({ value, onChange, customers }) {
  const differs = Boolean(value)
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={differs}
          onChange={(e) => onChange(e.target.checked ? newCustomer() : null)}
        />
        Ship to a different address (Consignee)
        <span className="text-xs text-muted-foreground">(GST place of supply follows this address)</span>
      </label>
      {differs && <CustomerFields value={value} onChange={onChange} customers={customers} />}
    </div>
  )
}
