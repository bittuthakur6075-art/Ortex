import { DEFAULT_SCRIPTS } from "./telecallerScripts"

// Default settings + merge logic, shared by every repository implementation
// (localStore, apiStore) so a saved settings blob is reconciled against the
// current defaults identically no matter where it's persisted.

export const DEFAULT_SETTINGS = {
  company: {
    name: "Ortex Industries",
    tagline: "Manufacturer of customized products",
    email: "sales@ortexindustries.in",
    phone: "+91-9211947188",
    website: "ortexindustries.in",
    gstin: "07ABCDE1234F1Z5",
    stateCode: "07", // Delhi - home state for CGST/SGST vs IGST determination
    address: "New Delhi, India",
    bankName: "",
    bankBranch: "",
    bankAccount: "",
    bankIfsc: "",
    upi: "",
    // Other names, UPI IDs and accounts that mean "us" on a payment screenshot
    // (an owner paying from a personal account): paymentDirection() reads them.
    paymentAliases: [],
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
    quotationSeq: 1,
    invoiceSeq: 1,
    paymentSeq: 1,
  },
  quotation: {
    validityDays: 15,
    terms: "1. This quotation is valid until the date shown above.\n2. Prices are for the quantities and specifications quoted; GST is charged at the rates shown.\n3. Production starts on artwork approval and a 50% advance; the balance is payable before dispatch.\n4. The delivery timeline is confirmed with the order.",
  },
  // The words printed on each document (Control centre -> Documents). Staff
  // read this block through settings_staff (migration 0071).
  documents: {
    // An invoice is final and states the GST charged, so the quotation's conditions do not belong on it.
    invoiceTerms: "1. Payment is due by the due date on this invoice. Please quote the invoice number with your payment.\n2. Any shortage or damage must be reported within 7 days of delivery.\n3. Goods once sold will not be taken back.\n4. Subject to Delhi jurisdiction. E&OE.",
    quotationFooter: "Thank you for your enquiry. This is a computer-generated quotation and needs no signature.",
    invoiceFooter: "Thank you for your business.",
    receiptFooter: "Thank you for your payment. This is a computer-generated receipt.",
  },
  notifications: {
    // Email a copy of every newly-generated invoice.
    invoiceEmailEnabled: true,
    recipient: "louis.sharma37@gmail.com",
    // "From" address, the company reply email shown as the sender.
    sender: "noreply@ortexindustries.in",
    // Optional EmailJS credentials, if all three are set, invoices are sent
    // silently from the browser; otherwise the user's mail client is opened.
    // (Superseded server-side once the Edge Function email path is live.)
    emailjs: { serviceId: "", templateId: "", publicKey: "" },
  },
  integrations: {
    // IndiaMART Lead Manager Pull API, paste your CRM key and enable to pull
    // buyer enquiries into the Enquiries module. lastPull tracks the sync window.
    indiamart: { crmKey: "", enabled: false, lastPull: null, lastResult: "" },
  },
  // AI telecaller (Telecaller module). Mirrored by DEFAULT_TELECALLER in
  // supabase/functions/_shared/telecaller.ts. Keep the two in step.
  telecaller: {
    enabled: false, // master switch for the automatic sweep (manual "AI call" always works)
    provider: "simulate", // "simulate" (Gemini role-play, no phone) | "vapi" (real outbound calls)
    agentName: "Sneha",
    language: "auto", // see telecallerLanguages.js
    callingHours: { start: "10:00", end: "19:00" },
    timezone: "Asia/Kolkata",
    dailyCap: 40,
    maxAttempts: 3,
    retryGapHours: 24,
    autoQueueNewLeads: true,
    followUp: { enabled: true, delayHours: 24, maxRounds: 3 },
    feedback: { enabled: true, daysAfterInvoice: 7 },
    upsell: { enabled: true, daysAfterInvoice: 30, repeatEveryDays: 90 },
    pitchNotes: "",
    occasions: "", // team-added dates, one per line: "YYYY-MM-DD Name - what to pitch"
    pulse: null, // { text, at, sources } - daily India business pulse written by the engine
    doNotCall: [],
    // Training scripts: persona notes + per-call-type objectives (blank = default).
    scripts: { ...DEFAULT_SCRIPTS },
  },
}

// Deep-merge a saved settings object over the defaults so new default keys
// appear for existing data. Returns DEFAULT_SETTINGS when `saved` is falsy.
export function mergeSettings(saved) {
  if (!saved) return DEFAULT_SETTINGS
  return {
    company: { ...DEFAULT_SETTINGS.company, ...saved.company },
    tax: { ...DEFAULT_SETTINGS.tax, ...saved.tax },
    numbering: { ...DEFAULT_SETTINGS.numbering, ...saved.numbering },
    quotation: { ...DEFAULT_SETTINGS.quotation, ...saved.quotation },
    documents: { ...DEFAULT_SETTINGS.documents, ...saved.documents },
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...saved.notifications,
      emailjs: { ...DEFAULT_SETTINGS.notifications.emailjs, ...saved.notifications?.emailjs },
    },
    integrations: {
      ...DEFAULT_SETTINGS.integrations,
      ...saved.integrations,
      indiamart: { ...DEFAULT_SETTINGS.integrations.indiamart, ...saved.integrations?.indiamart },
    },
    telecaller: {
      ...DEFAULT_SETTINGS.telecaller,
      ...saved.telecaller,
      callingHours: { ...DEFAULT_SETTINGS.telecaller.callingHours, ...saved.telecaller?.callingHours },
      followUp: { ...DEFAULT_SETTINGS.telecaller.followUp, ...saved.telecaller?.followUp },
      feedback: { ...DEFAULT_SETTINGS.telecaller.feedback, ...saved.telecaller?.feedback },
      upsell: { ...DEFAULT_SETTINGS.telecaller.upsell, ...saved.telecaller?.upsell },
      doNotCall: Array.isArray(saved.telecaller?.doNotCall) ? saved.telecaller.doNotCall : [],
      scripts: { ...DEFAULT_SETTINGS.telecaller.scripts, ...saved.telecaller?.scripts },
    },
  }
}

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v)

const BLANK_COMPANY = {
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
}

/** The blocks that belong to one company (companies.doc, migration 0075); the rest of settings is global. */
export const COMPANY_BLOCKS = ["company", "tax", "numbering", "quotation", "documents"]

/**
 * One company's settings (migration 0075): the `companies.doc` blocks over the
 * global settings. tax, numbering, quotation and documents fall back to the
 * global block, as settings_staff does; the company block NEVER does, and never
 * takes the demo defaults either, so another company can never print Ortex's
 * (or a placeholder) GSTIN. No company doc: the global settings as before.
 * Global-only blocks (notifications, integrations, telecaller) pass through.
 * Mirrored by Ortex.Mobile/src/domain/settings.ts (same name): edit both.
 */
export function settingsFor(globalSettings, companyDoc) {
  const g = isPlainObject(globalSettings) ? globalSettings : {}
  if (!isPlainObject(companyDoc)) return mergeSettings(g)
  const block = (k) => (isPlainObject(companyDoc[k]) ? companyDoc[k] : g[k])
  const merged = mergeSettings({
    ...g,
    tax: block("tax"),
    numbering: block("numbering"),
    quotation: block("quotation"),
    documents: block("documents"),
  })
  const company = isPlainObject(companyDoc.company) ? companyDoc.company : {}
  const set = Object.fromEntries(Object.entries(company).filter(([, v]) => v != null))
  return { ...merged, company: { ...BLANK_COMPANY, ...set } }
}
