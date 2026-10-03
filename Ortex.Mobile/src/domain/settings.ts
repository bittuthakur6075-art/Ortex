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
  bankBranch: string
  bankAccount: string
  bankIfsc: string
  upi: string
  paymentAliases: string[]
  logoText: string
  /** A public storage URL of the company's logo, uploaded on the console's Companies page (Admin 0075); "" for none. */
  logoUrl: string
}

export type Settings = {
  company: CompanySettings
  tax: { defaultGstRate: number; pricesIncludeTax: boolean }
  numbering: { quotationPrefix: string; invoicePrefix: string; paymentPrefix: string }
  quotation: { validityDays: number; terms: string }
  documents: { invoiceTerms: string; quotationFooter: string; invoiceFooter: string; receiptFooter: string }
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
    bankBranch: "",
    bankAccount: "",
    bankIfsc: "",
    upi: "",
    paymentAliases: [],
    logoText: "Ortex",
    logoUrl: "",
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
      "1. This quotation is valid until the date shown above.\n2. Prices are for the quantities and specifications quoted; GST is charged at the rates shown.\n3. Production starts on artwork approval and a 50% advance; the balance is payable before dispatch.\n4. The delivery timeline is confirmed with the order.",
  },
  documents: {
    invoiceTerms:
      "1. Payment is due by the due date on this invoice. Please quote the invoice number with your payment.\n2. Any shortage or damage must be reported within 7 days of delivery.\n3. Goods once sold will not be taken back.\n4. Subject to Delhi jurisdiction. E&OE.",
    quotationFooter: "Thank you for your enquiry. This is a computer-generated quotation and needs no signature.",
    invoiceFooter: "Thank you for your business.",
    receiptFooter: "Thank you for your payment. This is a computer-generated receipt.",
  },
}

type Dict = Record<string, unknown>

const isPlainObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v)

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

const BLANK_COMPANY: CompanySettings = {
  name: "",
  tagline: "",
  email: "",
  phone: "",
  website: "",
  gstin: "",
  stateCode: "",
  address: "",
  bankName: "",
  bankBranch: "",
  bankAccount: "",
  bankIfsc: "",
  upi: "",
  paymentAliases: [],
  logoText: "",
  logoUrl: "",
}

/**
 * One company's settings (Admin migration 0075): the `companies.doc` blocks over
 * the global shape `settings_staff` gives. tax, numbering, quotation and
 * documents fall back to the global block, as the view does; the company block
 * NEVER does, and never takes the demo defaults either, so another company can
 * never print Ortex's (or a placeholder) GSTIN. No company doc: the global
 * settings as before.
 */
export function settingsFor(globalSettings: unknown, companyDoc: unknown): Settings {
  const g: Dict = isPlainObject(globalSettings) ? globalSettings : {}
  if (!isPlainObject(companyDoc)) return mergeSettings(g)
  const block = (k: string) => (isPlainObject(companyDoc[k]) ? companyDoc[k] : g[k])
  const merged = mergeSettings({
    tax: block("tax"),
    numbering: block("numbering"),
    quotation: block("quotation"),
    documents: block("documents"),
  })
  const company = isPlainObject(companyDoc.company) ? companyDoc.company : {}
  const set = Object.fromEntries(Object.entries(company).filter(([, v]) => v != null)) as Partial<CompanySettings>
  return { ...merged, company: { ...BLANK_COMPANY, ...set } }
}
