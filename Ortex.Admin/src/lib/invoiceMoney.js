// What an invoice has been paid, what it still owes and its live status, from
// its payments. Pure, so the Billing badge, the invoice list and editor, the
// Dashboard, Insights, Customers and the notification bell all agree.
// Re-exported by data/domain/domain.js.
//
// Migration 0066 recomputes the STORED amountPaid / status / paidAt in SQL on
// every payment change with the same rules: draft and cancelled are kept,
// grandTotal - paid <= SETTLE_TOLERANCE is paid, paid > 0 is partial, else a
// stored paid / partial falls back to sent.

import { round2, daysUntil } from "./format"

// Rupees still owed below which an invoice counts as settled (round-off and
// bank charges). The one cut-off for paid, settled and outstanding everywhere.
export const SETTLE_TOLERANCE = 0.5

export const isSettled = (balance) => balance <= SETTLE_TOLERANCE

// invoiceId -> rupees received, built once per payments array (WeakMap on the
// array), so a list of I invoices costs O(P) instead of O(I x P).
const paidCache = new WeakMap()
export function paidByInvoice(payments = []) {
  const hit = paidCache.get(payments)
  if (hit && hit.size === payments.length) return hit.map
  const map = new Map()
  for (const p of payments) {
    if (p?.type !== "inflow" || !p.invoiceId) continue
    map.set(p.invoiceId, (map.get(p.invoiceId) || 0) + (Number(p.amount) || 0))
  }
  for (const [k, v] of map) map.set(k, round2(v))
  paidCache.set(payments, { size: payments.length, map })
  return map
}

// Sum of inflow payments recorded against an invoice.
export function paidForInvoice(invoiceId, payments = []) {
  return paidByInvoice(payments).get(invoiceId) || 0
}

export function invoiceBalance(invoice, payments = []) {
  return round2((Number(invoice?.totals?.grandTotal) || 0) - paidForInvoice(invoice?.id, payments))
}

// Live status from the numbers, never from a stored paid / partial / overdue
// (an edit or a deleted payment leaves those stale). Draft and cancelled are a
// person's choice and are kept. Becomes overdue as time passes, with no job.
export function resolveInvoiceStatus(invoice, payments = []) {
  const stored = invoice?.status
  if (stored === "cancelled" || stored === "draft") return stored
  const grand = Number(invoice?.totals?.grandTotal) || 0
  const paid = paidForInvoice(invoice?.id, payments)
  if (grand > 0 && isSettled(round2(grand - paid))) return "paid"
  if (paid > 0) return "partial"
  if (invoice?.dueDate && daysUntil(invoice.dueDate) < 0) return "overdue"
  return "sent"
}

// Money an invoice still asks for: live (not draft or cancelled) and not settled.
export function outstandingBalance(invoice, payments = []) {
  if (invoice?.status === "draft" || invoice?.status === "cancelled") return 0
  const balance = invoiceBalance(invoice, payments)
  return isSettled(balance) ? 0 : balance
}

// For someone who may open invoices but not payments, RLS returns no payments
// at all, which would show every invoice unpaid. Instead each invoice's STORED
// amountPaid (kept right by migration 0066's trigger) stands in as one undated
// inflow, so it never counts as cash collected in a period.
export function paymentsOrStored(invoices = [], payments = [], canReadPayments = true) {
  if (canReadPayments) return payments
  return invoices
    .filter((i) => Number(i.amountPaid) > 0)
    .map((i) => ({ id: `stored-${i.id}`, type: "inflow", invoiceId: i.id, amount: Number(i.amountPaid), date: null, stored: true }))
}

// What a receipt says about the invoice AS OF that payment: received so far
// (inflows to the invoice dated on or before it, ties broken by created_at
// then id) and the balance left after it. A later payment does not change an
// earlier receipt.
export function receiptAllocation(payment, invoice, payments = []) {
  if (!payment?.invoiceId || !invoice) return null
  const key = (p) => [new Date(p.date).getTime() || 0, String(p.createdAt || ""), String(p.id || "")]
  const before = (a, b) => {
    const [x, y] = [key(a), key(b)]
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
    return true
  }
  const cumulative = round2(
    payments
      .filter((p) => p.type === "inflow" && p.invoiceId === payment.invoiceId && !p.stored && (p.id === payment.id || before(p, payment)))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  const balance = round2((Number(invoice.totals?.grandTotal) || 0) - cumulative)
  return { cumulative, balance, partial: !isSettled(balance) }
}
