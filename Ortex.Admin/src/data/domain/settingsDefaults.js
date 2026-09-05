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
    quotationSeq: 1,
    invoiceSeq: 1,
    paymentSeq: 1,
  },
  quotation: {
    validityDays: 15,
    terms: "1. Prices are subject to final artwork approval.\n2. 50% advance with the order, balance before dispatch.\n3. Delivery timeline confirmed on order.\n4. Taxes as applicable.",
  },
  notifications: {
    // Email a copy of every newly-generated invoice.
    invoiceEmailEnabled: true,
    recipient: "louis.sharma37@gmail.com",
    // "From" address — the company reply email shown as the sender.
    sender: "noreply@ortexindustries.in",
    // Optional EmailJS credentials — if all three are set, invoices are sent
    // silently from the browser; otherwise the user's mail client is opened.
    // (Superseded server-side once the Edge Function email path is live.)
    emailjs: { serviceId: "", templateId: "", publicKey: "" },
  },
  integrations: {
    // IndiaMART Lead Manager Pull API — paste your CRM key and enable to pull
    // buyer enquiries into the Enquiries module. lastPull tracks the sync window.
    indiamart: { crmKey: "", enabled: false, lastPull: null, lastResult: "" },
  },
  // AI telecaller (Telecaller module). Mirrored by DEFAULT_TELECALLER in
  // supabase/functions/_shared/telecaller.ts — keep the two in step.
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
