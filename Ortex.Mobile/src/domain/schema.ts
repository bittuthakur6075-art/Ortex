// Entity shapes, status vocabularies and factory helpers.
//
// PORT OF Ortex.Admin/src/data/domain/schema.js, narrowed to the collections
// this app touches (products, categories, customers, enquiries, quotations).
// Every field name below is a key inside the row's `doc` jsonb column, so a
// rename here without the same rename in the console silently drops data.

import type { StatusTone } from "@/theme/theme"

export type StatusOption = { id: string; label: string; tone: StatusTone }

// ---- shared status vocabularies -------------------------------------------

export const ENQUIRY_STATUS: StatusOption[] = [
  { id: "new", label: "New", tone: "blue" },
  { id: "contacted", label: "Contacted", tone: "amber" },
  { id: "qualified", label: "Qualified", tone: "violet" },
  { id: "quoted", label: "Quoted", tone: "cyan" },
  { id: "won", label: "Won", tone: "emerald" },
  { id: "lost", label: "Lost", tone: "rose" },
]

export const QUOTATION_STATUS: StatusOption[] = [
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "sent", label: "Sent", tone: "blue" },
  { id: "accepted", label: "Accepted", tone: "emerald" },
  { id: "rejected", label: "Rejected", tone: "rose" },
  { id: "expired", label: "Expired", tone: "amber" },
  { id: "invoiced", label: "Invoiced", tone: "violet" },
]

export const PRODUCT_STATUS: StatusOption[] = [
  { id: "active", label: "Active", tone: "emerald" },
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "archived", label: "Archived", tone: "amber" },
]

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

export const LEAD_SOURCES = [
  "Website contact form",
  "Quote calculator",
  "Orty chatbot",
  "Voice assistant (Anu)",
  "WhatsApp",
  "Phone",
  "Referral",
  "Trade show",
  "Email",
  "Other",
]

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

export function statusMeta(list: StatusOption[], id?: string): StatusOption {
  return list.find((s) => s.id === id) || list[0]
}

// ---- record shapes ---------------------------------------------------------

/** Server columns every row carries alongside its `doc`. */
export type Row = { id: string; createdAt?: string; updatedAt?: string }

export type Customer = {
  name: string
  company: string
  email: string
  phone: string
  gstin: string
  stateCode: string
  address: string
}

export type Line = {
  productId: string | null
  description: string
  hsn: string
  quantity: number
  unit: string
  rate: number
  discountPercent: number
  gstRate: number
}

export type Product = Row & {
  name: string
  sku: string
  category: string
  hsn: string
  unit: string
  material: string
  basePrice: number
  costPrice: number
  moq: number
  gstRate: number
  leadTimeDays: number
  status: string
  showOnWebsite: boolean
  description: string
  images: string[]
}

export type Category = Row & {
  name: string
  hsn: string
  gstRate: number
  description: string
  slug: string
  displayName: string
  image: string
  sortOrder: number
  active: boolean
  // Website copy. The console writes these (by hand or through its AI
  // copywriter) and the phone leaves them alone, but they are part of the row's
  // shape, so newCategory() has to declare them or a category created here
  // would be missing keys the site's category page reads.
  intro: string
  seoTitle: string
  seoDescription: string
}

/** A photo on the website's /work gallery (migration 0012). */
export type Work = Row & {
  title: string
  category: string
  image: string
  alt: string
  sortOrder: number
  active: boolean
}

export type EnquiryItem = { product: string; quantity: string; notes: string }

export type Enquiry = Row & {
  customer: Customer
  source: string
  productInterest: string
  message: string
  status: string
  starred: boolean
  owner: string
  notes: string
  // Not in the console's factory, but written by Ortex.Web's voice assistant.
  items?: EnquiryItem[]
  reference?: string
  leadId?: string | null
  // Written by Ortex.Web's live-orty/recording.js onto every lead row a call
  // produced. `recording` is the object path inside the private
  // `voice-recordings` bucket; `confirmed` is the read-back Anu got agreement
  // on. Rows saved before migration 0025 carry none of it.
  call?: {
    id?: string
    recording?: string
    confirmed?: boolean
    complete?: boolean
  }
}

export type Quotation = Row & {
  number: string
  status: string
  customer: Customer
  shipTo: Customer | null
  lines: Line[]
  extraDiscountPercent: number
  paymentTerms: string
  totals: import("@/domain/pricing").DocumentTotals
  issueDate: string
  validUntil: string
  validityDays: number
  notes: string
  terms: string
  enquiryId: string | null
  leadId: string | null
  lostReason: string
  invoiceId?: string
  /**
   * WHO QUOTED IT, captured at creation rather than resolved at print time: the
   * PDF is built later, often by someone else opening the record, so "the
   * signed-in user" would print the wrong person's name on a sent document.
   * `showSeller` is the rep's choice to put it on the sheet at all.
   */
  sellerName?: string
  showSeller?: boolean
}

// ---- entity factories ------------------------------------------------------

/** Mirrors `newProduct` in Admin/src/data/domain/schema.js, field for field. */
export function newProduct(overrides: Partial<Product> = {}) {
  return {
    name: "",
    sku: "",
    category: PRODUCT_CATEGORIES[0],
    hsn: "",
    unit: "pcs",
    material: "",
    basePrice: 0,
    costPrice: 0, // direct/material cost - drives real per-order gross margin
    moq: 1,
    gstRate: 18,
    leadTimeDays: 7,
    status: "active",
    // Separate from status on purpose: a product can be live for quoting and
    // still be kept off the public catalogue. Read by the products_public view
    // (migration 0020); absent means visible.
    showOnWebsite: true,
    description: "",
    images: [] as string[],
    ...overrides,
  }
}

/** Mirrors `newCategory` in Admin/src/data/domain/schema.js, field for field. */
export function newCategory(overrides: Partial<Category> = {}) {
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

/** Mirrors `slugifyCategory` in Admin/src/data/domain/schema.js. */
export function slugifyCategory(name: string): string {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Mirrors `newWork` in Admin/src/data/domain/schema.js, field for field. */
export function newWork(overrides: Partial<Work> = {}) {
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

export function newCustomer(overrides: Partial<Customer> = {}): Customer {
  return { name: "", company: "", email: "", phone: "", gstin: "", stateCode: "", address: "", ...overrides }
}

export function newLine(overrides: Partial<Line> = {}): Line {
  return {
    productId: null,
    description: "",
    hsn: "",
    quantity: 1,
    unit: "pcs",
    rate: 0,
    discountPercent: 0,
    // The console hardcodes 18 here rather than reading settings.tax.
    gstRate: 18,
    ...overrides,
  }
}
