// Payments on the phone (Super Admin and Admins): what the console's Billing ->
// Payments holds, and recording a payment received or a payout made.
//
// Pure (tested in test/payments.test.mjs); the write is lib/payments.ts.

import type { Payment } from "@/domain/schema"
import type { IconName } from "@/ui"

/** How the money moved, as the glyph in the row's well (the console draws the same ones). */
export const METHOD_ICON: Record<string, IconName> = {
  UPI: "mobile",
  "Bank transfer / NEFT": "bank",
  RTGS: "bank",
  Cheque: "cheque",
  Cash: "cash",
  Card: "card",
  Razorpay: "cardPos",
}

export type PaymentFilter = "all" | "inflow" | "payout"

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Received, paid out and the difference, with how many of each. */
export function paymentTotals(items: Payment[]) {
  let inflow = 0
  let payout = 0
  let ins = 0
  let outs = 0
  for (const p of items) {
    if (p.type === "inflow") {
      inflow += Number(p.amount) || 0
      ins++
    } else if (p.type === "payout") {
      payout += Number(p.amount) || 0
      outs++
    }
  }
  return { inflow: round2(inflow), payout: round2(payout), net: round2(inflow - payout), count: { all: items.length, inflow: ins, payout: outs } }
}

/** Newest first, by the payment's own date; filtered by direction and a search. */
export function visiblePayments(items: Payment[], filter: PaymentFilter, query = ""): Payment[] {
  const q = query.trim().toLowerCase()
  return items
    .filter((p) => filter === "all" || p.type === filter)
    .filter((p) => !q || [p.number, p.party, p.customer?.name, p.invoiceNumber, p.method, p.reference, p.note].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

const alnum = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "")

/** A payment already in the ledger with this UTR / transaction reference (spaces and case ignored). */
export function sameReference(reference: string, items: Payment[]): Payment | null {
  const ref = alnum(reference)
  if (ref.length < 6) return null
  return items.find((p) => alnum(p.reference) === ref) || null
}

export type PaymentDraft = {
  type: "inflow" | "payout"
  amount: string
  party: string
  method: string
  date: string // yyyy-mm-dd, IST
  reference: string
  note: string
}

/** The amount typed as a number ("1,23,456.50" -> 123456.5), or 0. */
export const amountOf = (s: string) => {
  const n = Number(String(s).replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? round2(n) : 0
}

/** The one thing stopping Save, said in words, or null. */
export function paymentBlocker(d: PaymentDraft): string | null {
  if (!amountOf(d.amount)) return "Enter the amount."
  if (!d.party.trim()) return d.type === "payout" ? "Enter who was paid." : "Enter who paid."
  if (!d.method) return "Choose how it was paid."
  return null
}
