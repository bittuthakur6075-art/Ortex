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
}

// ---- entity factories ------------------------------------------------------

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
