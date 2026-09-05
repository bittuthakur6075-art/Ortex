// Pure customer analytics: the numbers the Customers list and the customer
// detail page both need, derived from invoices, quotations and payments.
// No store access here - callers pass the rows they already hold.

import { round2 } from "./format"

// A customer with no order in this many days reads as dormant.
export const DORMANT_AFTER_DAYS = 90

// Vocabulary for StatusBadge, so the list and the detail page agree.
export const CUSTOMER_STATUS = [
  { id: "overdue", label: "Overdue", tone: "rose" },
  { id: "dormant", label: "Dormant", tone: "amber" },
  { id: "new", label: "New", tone: "blue" },
  { id: "active", label: "Active", tone: "emerald" },
]

const grandOf = (doc) => Number(doc?.totals?.grandTotal) || 0

const timeOf = (ts) => {
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : t
}

// Money received against one invoice (inflows only).
export function receivedAgainst(invoiceId, payments = []) {
  return round2(
    payments
      .filter((p) => p.invoiceId === invoiceId && p.type === "inflow")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
}

// Overdue beats dormant beats new: the badge should show the thing that needs
// acting on first.
export function customerStatus({ orders, overdue, daysSinceOrder }) {
  if (overdue > 0.5) return "overdue"
  if (!orders) return "new"
  if (daysSinceOrder != null && daysSinceOrder >= DORMANT_AFTER_DAYS) return "dormant"
  return "active"
}

// Lifetime figures for one customer. `invoices` should already be filtered to
// that customer; cancelled invoices are ignored throughout.
export function customerStats(invoices = [], payments = [], now = Date.now()) {
  const live = invoices.filter((i) => i.status !== "cancelled")
  let business = 0
  let outstanding = 0
  let overdue = 0
  let lastOrderAt = null

  for (const inv of live) {
    business = round2(business + grandOf(inv))
    const balance = round2(grandOf(inv) - receivedAgainst(inv.id, payments))
    if (balance > 0.5) {
      outstanding = round2(outstanding + balance)
      const due = timeOf(inv.dueDate)
      if (due != null && due < now) overdue = round2(overdue + balance)
    }
    const issued = timeOf(inv.issueDate) ?? timeOf(inv.createdAt)
    if (issued != null && (lastOrderAt == null || issued > lastOrderAt)) lastOrderAt = issued
  }

  const orders = live.length
  const daysSinceOrder = lastOrderAt == null ? null : Math.floor((now - lastOrderAt) / 86400000)
  const avgOrder = orders ? round2(business / orders) : 0

  return {
    business,
    outstanding,
    overdue,
    orders,
    avgOrder,
    lastOrderAt,
    daysSinceOrder,
    status: customerStatus({ orders, overdue, daysSinceOrder }),
  }
}

// What a customer actually buys: line items rolled up across their documents.
// For a made-to-order manufacturer the description is the product, so lines
// without a productId group on their text.
export function purchasedItems(docs = []) {
  const rows = new Map()
  for (const doc of docs) {
    for (const line of doc.lines || []) {
      const label = (line.description || "").trim() || "Unnamed item"
      const key = line.productId || label.toLowerCase()
      const quantity = Number(line.quantity) || 0
      const rate = Number(line.rate) || 0
      const discount = Number(line.discountPercent) || 0
      const value = round2(quantity * rate * (1 - discount / 100))
      const row = rows.get(key) || { key, label, unit: line.unit || "pcs", quantity: 0, value: 0, times: 0 }
      row.quantity = round2(row.quantity + quantity)
      row.value = round2(row.value + value)
      row.times += 1
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.value - a.value)
}

// Digits only, with the India country code added to a bare 10-digit mobile,
// for wa.me links.
export function whatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.length === 10 ? `91${digits}` : digits
}
