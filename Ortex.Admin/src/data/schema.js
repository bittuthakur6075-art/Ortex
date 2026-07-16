// Entity definitions, status vocabularies and factory helpers.
//
// Collections (persisted as separate keys by the store):
//   products    — product master data
//   enquiries   — inbound leads (contact + quote-calculator style)
//   quotations  — customer quotes with line items
//   invoices    — tax invoices (often converted from a quotation)
//   payments    — payment + payout ledger entries
//   settings    — singleton: company profile, tax + numbering config

export const COLLECTIONS = [
  "products",
  "categories",
  "work",
  "social",
  "customers",
  "enquiries",
  "leads",
  "quotations",
  "invoices",
  "payments",
  "user_activities",
  "event_logs",
  "whatsapp_logs",
  "ai_messages",
  "ai_usage",
  "automation_rules",
  "message_templates"
]

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

// Social post pipeline: idea → draft → review → approved → published.
// Nothing reaches Meta without passing through `approved`, which only an admin
// can set — see the social-publish Edge Function.
export const SOCIAL_STATUS = [
  { id: "idea", label: "Idea", tone: "slate" },
  { id: "draft", label: "Draft", tone: "blue" },
  { id: "review", label: "In review", tone: "amber" },
  { id: "approved", label: "Approved", tone: "violet" },
  { id: "scheduled", label: "Scheduled", tone: "cyan" },
  { id: "published", label: "Published", tone: "emerald" },
  { id: "failed", label: "Failed", tone: "rose" },
]

export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook Page" },
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

export const LEAD_SOURCES = ["Website contact form", "Quote calculator", "Orty chatbot", "Voice assistant (Anu)", "WhatsApp", "Phone", "Referral", "Trade show", "Email", "Other"]

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



// Helper to automatically detect product category from its name
export function autoDetectCategory(productName, categories = []) {
  if (!productName) return null
  const nameLower = productName.toLowerCase()

  // Custom keyword mappings for standard categories to be more accurate
  const keywordMappings = {
    "mdf": "MDF products",
    "wooden": "MDF products",
    "acrylic": "Acrylic products",
    "lanyard": "Lanyards & ID card accessories",
    "id card": "Lanyards & ID card accessories",
    "badge": "Badge manufacturing",
    "exam board": "Examination boards",
    "examination board": "Examination boards",
    "clipboard": "Clipboards & writing pads",
    "writing pad": "Clipboards & writing pads",
    "notepad": "Clipboards & writing pads",
    "gift": "Corporate gifting & merchandise",
    "bottle": "Corporate gifting & merchandise",
    "diary": "Corporate gifting & merchandise",
    "mug": "Corporate gifting & merchandise",
    "pen": "Corporate gifting & merchandise",
    "customization": "Customization & branding",
    "branding": "Customization & branding",
    "printing": "Customization & branding",
    "engraving": "Customization & branding"
  }

  // First try specific mappings
  for (const [kw, catName] of Object.entries(keywordMappings)) {
    if (nameLower.includes(kw)) {
      const match = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
      if (match) return match
    }
  }

  // Fallback: try matching category name words dynamically (longer match wins first)
  if (categories.length) {
    const sortedCats = [...categories].sort((a, b) => b.name.length - a.name.length)
    for (const cat of sortedCats) {
      const catWords = cat.name
        .toLowerCase()
        .split(/[\s&/]+/)
        .filter((w) => w && !["products", "and", "or", "manufacturing", "accessories", "other", "etc"].includes(w))
      
      for (const word of catWords) {
        if (word.length > 2 && nameLower.includes(word)) {
          return cat
        }
      }
    }
  }

  return null
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
    images: [],
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
    unit: "pcs",
    rate: 0,
    discountPercent: 0,
    gstRate: 18,
    dueOn: null,
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

export function newCategory(overrides = {}) {
  return {
    name: "",
    hsn: "",
    gstRate: 18,
    description: "",
    // Website-facing fields (read live by Ortex.Web catalogue pages):
    slug: "", // URL segment, e.g. "acrylic-products"; auto-derived if blank
    displayName: "", // heading shown on site; falls back to name
    intro: "", // marketing paragraph on the category page
    seoTitle: "", // <title> / og:title for the category page
    seoDescription: "", // meta description
    image: "", // hero/card image URL (public bucket or remote)
    sortOrder: 0, // display order on the /products hub
    active: true, // when false, hidden from the website
    ...overrides,
  }
}

export function newWork(overrides = {}) {
  return {
    title: "", // caption shown on the /work photo
    category: "", // filter bucket on the /work page
    image: "", // public bucket URL or remote image URL
    alt: "", // accessibility text; falls back to title
    sortOrder: 0, // lower shows first
    active: true, // when false, hidden from the website
    ...overrides,
  }
}

export function newSocialPost(overrides = {}) {
  return {
    status: "idea",
    topic: "", // the research angle, e.g. "Exam board bulk orders for schools"
    hook: "", // one-line reason this post is worth making
    caption: "", // the copy that ships to Meta
    hashtags: [], // stored without the leading '#'
    imagePrompt: "", // what social-creative feeds Gemini
    image: "", // PUBLIC bucket URL — Meta fetches this itself
    platforms: ["instagram", "facebook"],
    productId: null, // optional catalogue link the idea was grounded in
    scheduledFor: null, // ISO string; null means publish on approval
    approvedBy: "",
    approvedAt: null,
    publishedAt: null,
    // Per-platform outcome: { instagram: { id, permalink }, facebook: { id } }
    results: {},
    error: "",
    ...overrides,
  }
}

/** Caption + hashtags as Meta receives them. */
export function socialCaptionText(post) {
  const tags = (post?.hashtags || []).filter(Boolean).map((t) => `#${String(t).replace(/^#/, "")}`)
  return [String(post?.caption || "").trim(), tags.join(" ")].filter(Boolean).join("\n\n")
}

/** URL-safe slug from a category name ("Acrylic products" → "acrylic-products"). */
export function slugifyCategory(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function newUserActivity(overrides = {}) {
  return {
    userId: "",
    sessionId: "",
    productId: null,
    activityType: "",
    pageUrl: "",
    referrer: "",
    timestamp: new Date().toISOString(),
    device: "",
    browser: "",
    operatingSystem: "",
    ipAddress: "",
    metadata: {},
    ...overrides
  }
}

export function newEventLog(overrides = {}) {
  return {
    activityId: "",
    eventType: "",
    userId: "",
    description: "",
    timestamp: new Date().toISOString(),
    status: "processed",
    ...overrides
  }
}

export function newAiMessage(overrides = {}) {
  return {
    eventId: "",
    userId: "",
    customerName: "",
    triggerType: "",
    context: "",
    generatedMessage: "",
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

export function newWhatsappLog(overrides = {}) {
  return {
    userId: "",
    customerName: "",
    phone: "",
    templateName: "",
    messageText: "",
    status: "queued",
    retryCount: 0,
    maxRetries: 3,
    errorMessage: "",
    responsePayload: null,
    createdAt: new Date().toISOString(),
    sentAt: null,
    ...overrides
  }
}

export function newAutomationRule(overrides = {}) {
  return {
    name: "",
    triggerEvent: "",
    actionType: "whatsapp",
    templateId: "",
    delayMinutes: 0,
    active: true,
    description: "",
    ...overrides
  }
}

export function newMessageTemplate(overrides = {}) {
  return {
    name: "",
    category: "",
    body: "",
    placeholders: [],
    ...overrides
  }
}
