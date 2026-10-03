// Payments on the phone (whoever holds the `payments` module): what the
// console's Billing -> Payments holds, and recording a payment received or a
// payout made.
//
// Pure (tested in test/payments.test.mjs, with parity against the console in
// test/payments.parity.test.mjs); the write is lib/payments.ts.

import { dayKey } from "@/domain/attendance"
import { formatDate } from "@/domain/format"
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
  return {
    inflow: round2(inflow),
    payout: round2(payout),
    net: round2(inflow - payout),
    count: { all: items.length, inflow: ins, payout: outs },
  }
}

/** Newest first, by the payment's own date; filtered by direction and a search. */
export function visiblePayments(items: Payment[], filter: PaymentFilter, query = ""): Payment[] {
  const q = query.trim().toLowerCase()
  return items
    .filter((p) => filter === "all" || p.type === filter)
    .filter(
      (p) =>
        !q ||
        [p.number, p.party, p.customer?.name, p.invoiceNumber, p.method, p.reference, p.note].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

const alnum = (s: unknown) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")

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

/** Above this, Save asks once more (₹1 crore). */
export const BIG_AMOUNT = 1e7
/** The database refuses this and above (Admin migration 0066). */
export const MAX_AMOUNT = 1e10

/**
 * "1500,50" is a decimal comma, not "1,50,050": a comma followed by only one or
 * two digits at the end is never Indian digit grouping (the last group is
 * three), so it is refused instead of read as a hundred times the money.
 */
export const decimalComma = (s: string) => /,\d{1,2}$/.test(String(s).trim())

/** The amount typed as a number ("1,23,456.50" -> 123456.5), or 0. */
export const amountOf = (s: string) => {
  if (decimalComma(s)) return 0
  const n = Number(String(s).replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? round2(n) : 0
}

/** The day a stored payment belongs to, in IST whatever the phone's zone ("02 Oct 2026"). */
export function paymentDay(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "-"
  return formatDate(`${dayKey(t)}T12:00:00`)
}

/**
 * After a save that failed or got no answer: the row it may have written anyway,
 * created in the last two minutes (server time) with the same UTR, or the same
 * direction, amount, party and day.
 */
/**
 * `before` holds the ids that were already in the ledger when Save was pressed,
 * so an older, genuine payment that looks the same is never taken for this one.
 */
export function justSaved(
  d: PaymentDraft,
  items: Payment[],
  now: number,
  before: ReadonlySet<string> = new Set(),
): Payment | null {
  const amount = amountOf(d.amount)
  const party = d.party.trim().toLowerCase()
  return (
    items.find((p) => {
      if (before.has(p.id)) return false
      const at = Date.parse(String(p.createdAt || ""))
      if (!(at >= now - 120000)) return false
      if (sameReference(d.reference, [p])) return true
      const day = new Date(p.date).getTime()
      return (
        p.type === d.type &&
        round2(p.amount) === amount &&
        String(p.party || "")
          .trim()
          .toLowerCase() === party &&
        !Number.isNaN(day) &&
        dayKey(day) === d.date
      )
    }) || null
  )
}

/** The one thing stopping Save, said in words, or null. */
export function paymentBlocker(d: PaymentDraft): string | null {
  if (decimalComma(d.amount)) return "Use a full stop for paise: 1500.50, not 1500,50."
  if (!amountOf(d.amount)) return "Enter the amount."
  if (amountOf(d.amount) >= MAX_AMOUNT) return "That amount is too large to record."
  if (!d.party.trim()) return d.type === "payout" ? "Enter who was paid." : "Enter who paid."
  if (!d.method) return "Choose how it was paid."
  return null
}

/** The stored instant for a chosen IST day: midday IST keeps the day the same in every time zone. */
export const paymentDateIso = (day: string) => new Date(`${day}T12:00:00+05:30`).toISOString()

// ---- editing (the console's RecordPaymentModal in edit mode) ------------------------------

type Stored = Payment & { tally?: { status?: string } | null; advance?: boolean }

/** Migration 0066: a payment already in Tally is changed only by the Super Admin, and in Tally too. */
export const inTally = (p: Payment) => (p as Stored).tally?.status === "synced"
export const TALLY_LOCKED =
  "Already in Tally. Only the Super Admin can change it, and it must be changed in Tally too."

/** The form as it opens for a stored payment. */
export function draftOf(p: Payment): PaymentDraft {
  const t = new Date(p.date).getTime()
  return {
    type: p.type === "payout" ? "payout" : "inflow",
    amount: String(p.amount ?? ""),
    party: p.party || "",
    method: p.method || "UPI",
    date: Number.isNaN(t) ? "" : dayKey(t),
    reference: p.reference || "",
    note: p.note || "",
  }
}

/**
 * Only what changed, as the console's saveEdit: an untouched field (an imported
 * date at midnight, a frozen Tally field) is never rewritten. The number stays.
 * Turning a linked receipt into a payout unlinks it (0066 refuses a payout with
 * an invoice); an advance stays one only while it is an unlinked receipt.
 */
export function paymentPatch(p: Payment, d: PaymentDraft): Record<string, unknown> {
  const was = draftOf(p)
  const patch: Record<string, unknown> = {}
  if (d.type !== was.type) patch.type = d.type
  const amount = amountOf(d.amount)
  if (amount !== Number(p.amount)) patch.amount = amount
  if (d.date !== was.date) patch.date = paymentDateIso(d.date)
  for (const k of ["method", "reference", "note", "party"] as const) {
    const v = k === "method" ? d[k] : d[k].trim()
    if (v !== was[k]) patch[k] = v
  }
  const invoiceId = d.type === "payout" ? null : p.invoiceId || null
  if (invoiceId !== (p.invoiceId || null)) Object.assign(patch, { invoiceId, invoiceNumber: "", customer: null })
  const advance = !!(p as Stored).advance && d.type !== "payout" && !invoiceId
  if (advance !== !!(p as Stored).advance) patch.advance = advance
  return patch
}

// ---- the ledger's period and month sections ----------------------------------------------

export type PaymentPeriod = "month" | "fy" | "all"

/** The first day the period covers, or null for all time. `today` is yyyy-mm-dd (IST). */
export function periodStart(period: PaymentPeriod, today: string): string | null {
  if (period === "all") return null
  const [y, m] = today.split("-").map(Number)
  if (period === "month") return `${today.slice(0, 7)}-01`
  // India's financial year runs April to March.
  return `${m >= 4 ? y : y - 1}-04-01`
}

/** The payments dated within the period (by their IST day). */
export function inPeriod(items: Payment[], period: PaymentPeriod, today: string): Payment[] {
  const from = periodStart(period, today)
  if (!from) return items
  return items.filter((p) => {
    const t = new Date(p.date).getTime()
    return !Number.isNaN(t) && dayKey(t) >= from
  })
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** Consecutive runs of one IST month, in the order given ("October 2026"). */
export function monthSections(items: Payment[]): { key: string; title: string; data: Payment[] }[] {
  const out: { key: string; title: string; data: Payment[] }[] = []
  for (const p of items) {
    const t = new Date(p.date).getTime()
    const key = Number.isNaN(t) ? "undated" : dayKey(t).slice(0, 7)
    const last = out[out.length - 1]
    if (last?.key === key) last.data.push(p)
    else
      out.push({
        key,
        title: key === "undated" ? "No date" : `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
        data: [p],
      })
  }
  return out
}
