// Entity definitions, status vocabularies and factory helpers.
//
// Collections (persisted as separate keys by the store):
//   products    — product master data
//   enquiries   — inbound leads (contact + quote-calculator style)
//   quotations  — customer quotes with line items
//   invoices    — tax invoices (often converted from a quotation)
//   payments    — payment + payout ledger entries
//   settings    — singleton: company profile, tax + numbering config

export const COLLECTIONS = ["products", "categories", "customers", "enquiries", "leads", "quotations", "invoices", "payments"]

// ---- shared status vocabularies -------------------------------------------
// tone maps to the Badge component's colour set.

export const ENQUIRY_STATUS = [
  { id: "new", label: "New", tone: "blue" },
  { id: "contacted", label: "Contacted", tone: "amber" },
  { id: "qualified", label: "Qualified", tone: "violet" },
  { id: "quoted", label: "Quoted", tone: "cyan" },
  { id: "won", label: "Won", tone: "emerald" },
  { id: "lost", label: "Lost", tone: "rose" },
]

export const QUOTATION_STATUS = [
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "sent", label: "Sent", tone: "blue" },
  { id: "accepted", label: "Accepted", tone: "emerald" },
  { id: "rejected", label: "Rejected", tone: "rose" },
  { id: "expired", label: "Expired", tone: "amber" },
  { id: "invoiced", label: "Invoiced", tone: "violet" },
]

export const INVOICE_STATUS = [
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "sent", label: "Sent", tone: "blue" },
  { id: "partial", label: "Part-paid", tone: "amber" },
  { id: "paid", label: "Paid", tone: "emerald" },
  { id: "overdue", label: "Overdue", tone: "rose" },
  { id: "cancelled", label: "Cancelled", tone: "slate" },
]

export const PRODUCT_STATUS = [
  { id: "active", label: "Active", tone: "emerald" },
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "archived", label: "Archived", tone: "amber" },
]

// Lead pipeline. `prob` is the stage win-probability used for weighted pipeline
// value (Σ estimatedValue × prob). Ordered New → … → Won/Lost.
export const LEAD_STAGES = [
  { id: "new", label: "New", tone: "blue", prob: 5 },
  { id: "contacted", label: "Contacted", tone: "cyan", prob: 15 },
  { id: "qualified", label: "Qualified", tone: "violet", prob: 30 },
  { id: "quoted", label: "Quoted", tone: "amber", prob: 50 },
  { id: "negotiation", label: "Negotiation", tone: "amber", prob: 75 },
  { id: "won", label: "Won", tone: "emerald", prob: 100 },
  { id: "lost", label: "Lost", tone: "rose", prob: 0 },
]

// Open stages are the ones that carry a follow-up obligation / weighted value.
export const OPEN_LEAD_STAGES = ["new", "contacted", "qualified", "quoted", "negotiation"]

export function stageProbability(id) {
  return (LEAD_STAGES.find((s) => s.id === id) || { prob: 0 }).prob
}

export const ACTIVITY_TYPES = ["Call", "WhatsApp", "Email", "Meeting", "Sample sent", "Quote sent", "Note"]

export const PAYMENT_TYPE = [
  { id: "inflow", label: "Payment in", tone: "emerald" },
  { id: "payout", label: "Payout", tone: "rose" },
]

export const PAYMENT_METHODS = ["UPI", "Bank transfer / NEFT", "RTGS", "Cheque", "Cash", "Card", "Razorpay", "Other"]

export const PRODUCT_CATEGORIES = [
  "MDF products",
  "Acrylic products",
  "Lanyards & ID card accessories",
  "Badge manufacturing",
  "Examination boards",
  "Clipboards & writing pads",
  "Corporate gifting & merchandise",
  "Customization & branding",
]

export const UNITS = ["pcs", "set", "box", "sqft", "kg", "roll"]

export const GST_RATES = [0, 5, 12, 18, 28]

export const LEAD_SOURCES = ["Website contact form", "Quote calculator", "WhatsApp", "Phone", "Referral", "Trade show", "Email", "Other"]

// Captured on every lost quotation — turns losses into a fixable list.
export const LOST_REASONS = [
  "Price too high",
  "Competitor won",
  "Budget / postponed",
  "MOQ too high",
  "Lead time too long",
  "No response",
  "Spec mismatch",
  "Quality concern",
  "Other",
]

export function statusMeta(list, id) {
  return list.find((s) => s.id === id) || list[0]
}

// ---- entity factories ------------------------------------------------------

export function newProduct(overrides = {}) {
  return {
    name: "",
    sku: "",
    category: PRODUCT_CATEGORIES[0],
    hsn: "",
    unit: "pcs",
    material: "",
    basePrice: 0,
    costPrice: 0, // direct/material cost — drives real per-order gross margin
    moq: 1,
    gstRate: 18,
    leadTimeDays: 7,
    status: "active",
    description: "",
    ...overrides,
  }
}

export function newCustomer(overrides = {}) {
  return { name: "", company: "", email: "", phone: "", gstin: "", stateCode: "", address: "", ...overrides }
}

export function newLine(overrides = {}) {
  return {
    productId: null,
    description: "",
    hsn: "",
    quantity: 1,
    rate: 0,
    discountPercent: 0,
    gstRate: 18,
    ...overrides,
  }
}

export function newEnquiry(overrides = {}) {
  return {
    customer: newCustomer(),
    source: "Website contact form",
    productInterest: "",
    message: "",
    status: "new",
    starred: false,
    owner: "",
    notes: "",
    ...overrides,
  }
}

export function newLead(overrides = {}) {
  return {
    enquiryId: null,
    customer: newCustomer(),
    source: "Website contact form",
    productInterest: "",
    quantityEstimate: "",
    estimatedValue: 0,
    stage: "new",
    score: 0,
    owner: "",
    nextFollowUp: null,
    lastActivityAt: null,
    lostReason: "",
    linkedQuotationId: null,
    activities: [],
    notes: "",
    ...overrides,
  }
}

export function newActivity(overrides = {}) {
  return { type: "Note", direction: "outbound", summary: "", owner: "", ...overrides }
}

// Product category master. Default HSN + GST auto-fill onto a product when its
// category is chosen.
export function newCategory(overrides = {}) {
  return { name: "", hsn: "", gstRate: 18, description: "", ...overrides }
}
