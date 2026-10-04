import { Input, Field, Select } from "../ui/Ui"
import { cleanPhoneInput } from "../../lib/validateCustomer"
import { GST_STATES } from "../../lib/gstStates"

const STATE_OPTIONS = Object.entries(GST_STATES)

// Reusable customer detail grid used by the quotation and invoice editors.
// `value` is a customer object; `onChange` receives the full updated object.
// If `customers` (the master list) is provided, a picker prefills the fields
// from an existing customer. `errors` / `warnings` are validateDocument's for
// this party (keys name, phone, ...), and `prefix` names it in `data-path`.
export default function CustomerFields({ value, onChange, customers, errors = {}, warnings = {}, prefix = "customer" }) {
  const set = (key, v) => onChange({ ...value, [key]: v })
  const at = (key) => ({ "data-path": `${prefix}.${key}`, error: errors[key], warning: warnings[key] })

  // A valid GSTIN names its state in the first two digits: fill an empty
  // place of supply from it. Automatically uppercase, strip non-alphanumeric, and cap at 15.
  const setGstin = (raw) => {
    const g = String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15)
    const next = { ...value, gstin: g }
    if (!String(value.stateCode || "").trim() && g.length >= 2 && GST_STATES[g.slice(0, 2)]) {
      next.stateCode = g.slice(0, 2)
    }
    onChange(next)
  }

  // Only digits and optional leading +, preventing symbols, spaces, and alphabets
  const setPhone = (raw) => set("phone", cleanPhoneInput(raw))

  // Email: strip whitespace and cap length
  const setEmail = (raw) => set("email", String(raw || "").replace(/\s/g, "").slice(0, 100))

  const code = String(value.stateCode || "").trim()

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
        <Field label="Customer name" required {...at("name")}>
          <Input
            value={value.name || ""}
            onChange={(e) => set("name", e.target.value.slice(0, 100))}
            placeholder="Enter customer name"
            maxLength={100}
          />
        </Field>
        <Field label="Company" {...at("company")}>
          <Input
            value={value.company || ""}
            onChange={(e) => set("company", e.target.value.slice(0, 120))}
            placeholder="Enter company name"
            maxLength={120}
          />
        </Field>
        <Field label="Email" {...at("email")}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={value.email || ""}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            maxLength={100}
          />
        </Field>
        <Field label="Phone" {...at("phone")}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={value.phone || ""}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile or landline"
            maxLength={13}
          />
        </Field>
        <Field label="GSTIN" hint="Buyer's GST number (for input credit)" {...at("gstin")}>
          <Input
            value={value.gstin || ""}
            onChange={(e) => setGstin(e.target.value)}
            placeholder="15-character GSTIN (e.g. 07AABCU9603R1ZP)"
            maxLength={15}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Field>
        <Field label="State (place of supply)" hint="Decides CGST + SGST or IGST" required {...at("stateCode")}>
          <Select searchable searchPlaceholder="Search states" value={code} onChange={(e) => set("stateCode", e.target.value)} placeholder="Choose a state">
            <option value="">Not set</option>
            {STATE_OPTIONS.map(([c, name]) => (
              <option key={c} value={c} data-search={c}>
                {c} · {name}
              </option>
            ))}
            {code && !GST_STATES[code] && <option value={code}>{code}</option>}
          </Select>
        </Field>
        <Field label={prefix === "shipTo" ? "Delivery address" : "Billing address"} className="sm:col-span-2" {...at("address")}>
          <Input
            value={value.address || ""}
            onChange={(e) => set("address", e.target.value.slice(0, 300))}
            placeholder={prefix === "shipTo" ? "Enter delivery address" : "Enter billing address"}
            maxLength={300}
          />
        </Field>
      </div>
    </div>
  )
}
