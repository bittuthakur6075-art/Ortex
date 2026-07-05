import { Input, Field, Select } from "./ui"

// Reusable customer detail grid used by the quotation and invoice editors.
// `value` is a customer object; `onChange` receives the full updated object.
// If `customers` (the master list) is provided, a picker prefills the fields
// from an existing customer.
export default function CustomerFields({ value, onChange, customers }) {
  const set = (key, v) => onChange({ ...value, [key]: v })

  const pick = (id) => {
    const c = customers?.find((x) => x.id === id)
    if (!c) return
    onChange({
      name: c.name || "",
      company: c.company || "",
      email: c.email || "",
      phone: c.phone || "",
      gstin: c.gstin || "",
      stateCode: c.stateCode || "",
      address: c.address || "",
    })
  }

  return (
    <div className="space-y-4">
      {customers && customers.length > 0 && (
        <Field label="Pick an existing customer" hint="Or fill the details below for a new one">
          <Select value="" onChange={(e) => pick(e.target.value)}>
            <option value="">Select a customer…</option>
            {[...customers]
              .sort((a, b) => (a.company || a.name || "").localeCompare(b.company || b.name || ""))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company || c.name}
                  {c.company && c.name ? ` · ${c.name}` : ""}
                </option>
              ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer name" required>
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Contact person" />
        </Field>
        <Field label="Company">
          <Input value={value.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
        </Field>
        <Field label="Email">
          <Input value={value.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label="Phone">
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91-XXXXXXXXXX" />
        </Field>
        <Field label="GSTIN" hint="Buyer's GST number (for input credit)">
          <Input value={value.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="27AACCT5678D1Z9" />
        </Field>
        <Field label="State code" hint="Decides CGST/SGST vs IGST">
          <Input value={value.stateCode} onChange={(e) => set("stateCode", e.target.value)} placeholder="07" />
        </Field>
        <Field label="Billing address" className="sm:col-span-2">
          <Input value={value.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, state" />
        </Field>
      </div>
    </div>
  )
}
