// Settings shape + defaults.
//
// PORT OF the quotation-relevant slice of
// Ortex.Admin/src/data/domain/settingsDefaults.js. The console owns the
// settings row; this app only reads it. `mergeSettings` mirrors the console's
// deep merge so a settings blob saved before a key existed still yields a
// complete object rather than an undefined lookup mid-quotation.

export type CompanySettings = {
  name: string
  tagline: string
  email: string
  phone: string
  website: string
  gstin: string
  stateCode: string
  address: string
  bankName: string
  bankAccount: string
  bankIfsc: string
  upi: string
  logoText: string
}

export type Settings = {
  company: CompanySettings
  tax: { defaultGstRate: number; pricesIncludeTax: boolean }
  numbering: { quotationPrefix: string; invoicePrefix: string; paymentPrefix: string }
  quotation: { validityDays: number; terms: string }
}

export const DEFAULT_SETTINGS: Settings = {
  company: {
    name: "Ortex Industries",
    tagline: "Manufacturer of customized products",
    email: "sales@ortexindustries.in",
    phone: "+91-9211947188",
    website: "ortexindustries.in",
    gstin: "07ABCDE1234F1Z5",
    stateCode: "07", // Delhi — home state for CGST/SGST vs IGST determination
    address: "New Delhi, India",
    bankName: "",
    bankAccount: "",
    bankIfsc: "",
    upi: "",
    logoText: "Ortex",
  },
  tax: {
    defaultGstRate: 18,
    pricesIncludeTax: false,
  },
  numbering: {
    quotationPrefix: "QTN",
    invoicePrefix: "INV",
    paymentPrefix: "PAY",
  },
  quotation: {
    validityDays: 15,
    terms:
      "1. Prices are subject to final artwork approval.\n2. 50% advance with the order, balance before dispatch.\n3. Delivery timeline confirmed on order.\n4. Taxes as applicable.",
  },
}

type Dict = Record<string, unknown>

const isPlainObject = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Deep-merge a saved blob over the defaults so new keys always appear. */
export function mergeSettings(saved: unknown): Settings {
  const merge = (base: Dict, patch: Dict): Dict => {
    const out: Dict = { ...base }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      const current = out[k]
      out[k] = isPlainObject(current) && isPlainObject(v) ? merge(current, v) : v
    }
    return out
  }
  if (!isPlainObject(saved)) return DEFAULT_SETTINGS
  return merge(DEFAULT_SETTINGS as unknown as Dict, saved) as unknown as Settings
}
