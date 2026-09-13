/**
 * Anu for staff: the pure answers behind her tools.
 *
 * The website's Anu sells to a stranger. This one works FOR the person holding
 * the phone: a rep or an admin asking about their own pipeline. Every function
 * here is a plain function of rows the phone already reads under that person's
 * own Supabase session, so what Anu can say is exactly what RLS lets them see,
 * and nothing in this file can widen it.
 *
 * Replies are shaped for a VOICE model: short, pre-formatted money and dates,
 * capped lists, ids kept for opening a record but never meant to be read aloud.
 * Tested in test/anu.test.mjs.
 */

import { formatCurrency, formatDate } from "@/domain/format"
import {
  ENQUIRY_STATUS,
  QUOTATION_STATUS,
  newLine,
  statusMeta,
  type Customer,
  type Enquiry,
  type Line,
  type Product,
  type Quotation,
} from "@/domain/schema"
import { VOICE_SOURCE, parseQuantity, voiceCallsFrom, type VoiceCall } from "@/domain/voice"

export const DAY_MS = 24 * 60 * 60 * 1000
/** Lists are read aloud; five is already a lot to hear. */
export const MAX_RESULTS = 5

type Row = { id: string; createdAt?: string; updatedAt?: string }
export type CustomerRow = Customer & Row
export type EnquiryRow = Enquiry
export type QuotationRow = Quotation
export type ProductRow = Product

// ---- matching ----------------------------------------------------------------

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9@.+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const digitsOf = (s: unknown) => String(s ?? "").replace(/\D/g, "")

/**
 * How well `fields` answer `query`: every query word must appear in some field
 * (a person says "Sharma lanyards", not a full name), with a bonus for a field
 * that STARTS with the query. A phone query matches on its last 10 digits, so
 * "+91 98765 43210" and "9876543210" are the same number. 0 = no match.
 */
export function matchScore(query: string, fields: unknown[]): number {
  const q = norm(query)
  if (!q) return 1
  const qDigits = digitsOf(query)
  if (qDigits.length >= 6) {
    const tail = qDigits.slice(-10)
    if (fields.some((f) => digitsOf(f).endsWith(tail) || (digitsOf(f).length >= 6 && tail.endsWith(digitsOf(f))))) return 10
  }
  const hay = fields.map(norm).filter(Boolean)
  if (!hay.length) return 0
  const words = q.split(" ").filter((w) => w.length > 1 || q.length === 1)
  const all = hay.join(" ")
  if (!words.every((w) => all.includes(w))) return 0
  let score = 1
  if (hay.some((h) => h === q)) score += 5
  else if (hay.some((h) => h.startsWith(q))) score += 3
  else if (hay.some((h) => h.includes(q))) score += 2
  return score
}

function ranked<T>(items: T[], query: string, fields: (item: T) => unknown[]): T[] {
  return items
    .map((item) => ({ item, score: matchScore(query, fields(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}

const time = (ts?: string) => {
  const t = new Date(ts || "").getTime()
  return Number.isNaN(t) ? 0 : t
}

const daysAgo = (ts: string | undefined, now: number) => Math.max(0, Math.floor((now - time(ts)) / DAY_MS))

/** "today", "yesterday", "5 days ago" — how a person says it on a call. */
export function spokenAge(ts: string | undefined, now: number): string {
  if (!time(ts)) return "an unknown date"
  const d = daysAgo(ts, now)
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`
}

const who = (c?: Partial<Customer>) => c?.company || c?.name || "an unnamed customer"
const money = (n: unknown) => formatCurrency(Number(n) || 0)
const isWon = (s: string) => s === "accepted" || s === "invoiced"

// ---- briefing ----------------------------------------------------------------

export type Access = { enquiries: boolean; voice: boolean; quotations: boolean; customers: boolean; products: boolean }

/**
 * "What needs me today?" The same signals the notification feed raises, as one
 * spoken-length answer: untouched web enquiries, Anu's calls nobody has rung
 * back, sent quotations about to lapse or already lapsed, and quotations waiting
 * on a decision for a week.
 */
export function briefing(
  data: { enquiries: EnquiryRow[]; quotations: QuotationRow[] },
  access: Access,
  now = Date.now(),
) {
  const out: Record<string, unknown> = {}

  if (access.enquiries) {
    const web = data.enquiries.filter((e) => e.source !== VOICE_SOURCE && (e.status || "new") === "new")
    out.new_enquiries = {
      count: web.length,
      waiting_over_2_days: web.filter((e) => daysAgo(e.createdAt, now) >= 2).length,
      latest: web
        .sort((a, b) => time(b.createdAt) - time(a.createdAt))
        .slice(0, MAX_RESULTS)
        .map((e) => ({
          id: e.id,
          kind: "enquiry",
          customer: who(e.customer),
          wants: e.productInterest || "not stated",
          received: spokenAge(e.createdAt, now),
        })),
    }
  }

  if (access.voice) {
    const calls = voiceCallsFrom(data.enquiries).filter((c) => (c.status || "new") === "new")
    out.anu_calls_to_return = {
      count: calls.length,
      support_complaints: calls.filter((c) => c.flags.support).length,
      latest: calls.slice(0, MAX_RESULTS).map((c) => voiceSummary(c, now)),
    }
  }

  if (access.quotations) {
    const sent = data.quotations.filter((q) => q.status === "sent")
    const until = (q: QuotationRow) => time(q.validUntil)
    const expiring = sent.filter((q) => until(q) >= now && until(q) - now <= 3 * DAY_MS)
    const lapsed = sent.filter((q) => until(q) && until(q) < now)
    const waiting = sent.filter((q) => daysAgo(q.issueDate || q.createdAt, now) >= 7 && !lapsed.includes(q))
    const brief = (q: QuotationRow) => ({
      id: q.id,
      kind: "quotation",
      number: q.number,
      customer: who(q.customer),
      value: money(q.totals?.grandTotal),
      valid_until: q.validUntil ? formatDate(q.validUntil) : "not set",
    })
    out.quotations = {
      expiring_within_3_days: expiring.map(brief).slice(0, MAX_RESULTS),
      already_expired_but_still_sent: lapsed.map(brief).slice(0, MAX_RESULTS),
      waiting_a_week_or_more: waiting.map(brief).slice(0, MAX_RESULTS),
      open_pipeline_value: money(sent.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0)),
    }
  }

  return out
}

function voiceSummary(c: VoiceCall, now: number) {
  return {
    id: c.id,
    kind: "voice_call",
    caller: c.named ? c.name : "a caller who gave no name",
    phone: c.customer.phone || "not captured",
    wants: c.itemsList.length
      ? c.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" ")).join(", ")
      : c.productInterest || c.summary || "not captured",
    support: c.flags.support,
    urgent: c.flags.urgent,
    called: spokenAge(c.endedAt, now),
    status: statusMeta(ENQUIRY_STATUS, c.status).label,
  }
}

// ---- search --------------------------------------------------------------------

export function findCustomers(customers: CustomerRow[], quotations: QuotationRow[], query: string) {
  return ranked(customers, query, (c) => [c.name, c.company, c.phone, c.email, c.gstin])
    .slice(0, MAX_RESULTS)
    .map((c) => {
      const theirs = quotations.filter(
        (q) =>
          (digitsOf(q.customer?.phone) && digitsOf(q.customer?.phone).slice(-10) === digitsOf(c.phone).slice(-10)) ||
          (!!q.customer?.email && q.customer.email.toLowerCase() === (c.email || "").toLowerCase()),
      )
      const won = theirs.filter((q) => isWon(q.status))
      const last = [...theirs].sort((a, b) => time(b.createdAt) - time(a.createdAt))[0]
      return {
        id: c.id,
        kind: "customer",
        name: c.name || "not recorded",
        company: c.company || "none",
        phone: c.phone || "not recorded",
        email: c.email || "not recorded",
        quotations: theirs.length,
        won_value: money(won.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0)),
        last_quotation: last ? `${last.number}, ${statusMeta(QUOTATION_STATUS, last.status).label}, ${money(last.totals?.grandTotal)}` : "none",
      }
    })
}

export function findEnquiries(
  enquiries: EnquiryRow[],
  opts: { query?: string; status?: string; days?: number },
  access: Pick<Access, "enquiries" | "voice">,
  now = Date.now(),
) {
  const since = opts.days ? now - opts.days * DAY_MS : 0
  const statusOk = (s?: string) => !opts.status || (s || "new") === opts.status

  const web = access.enquiries
    ? ranked(
        enquiries.filter((e) => e.source !== VOICE_SOURCE && statusOk(e.status) && time(e.createdAt) >= since),
        opts.query || "",
        (e) => [e.customer?.name, e.customer?.company, e.customer?.phone, e.productInterest, e.message, e.reference],
      ).map((e) => ({
        id: e.id,
        kind: "enquiry",
        customer: who(e.customer),
        phone: e.customer?.phone || "not captured",
        wants: e.productInterest || "not stated",
        source: e.source || "unknown",
        status: statusMeta(ENQUIRY_STATUS, e.status).label,
        received: spokenAge(e.createdAt, now),
        _at: time(e.createdAt),
      }))
    : []

  const voice = access.voice
    ? voiceCallsFrom(enquiries)
        .filter((c) => statusOk(c.status) && time(c.endedAt) >= since)
        .filter((c) =>
          matchScore(opts.query || "", [c.name, c.customer.phone, c.customer.company, c.productInterest, c.summary, c.reference, ...c.itemsList.map((i) => i.product)]),
        )
        .map((c) => ({ ...voiceSummary(c, now), _at: time(c.endedAt) }))
    : []

  const merged = [...web, ...voice].sort((a, b) => b._at - a._at)
  return {
    total: merged.length,
    results: merged.slice(0, MAX_RESULTS).map(({ _at, ...rest }) => rest),
  }
}

export function findQuotations(quotations: QuotationRow[], opts: { query?: string; status?: string }) {
  const hits = ranked(
    quotations.filter((q) => !opts.status || q.status === opts.status),
    opts.query || "",
    (q) => [q.number, q.customer?.name, q.customer?.company, q.customer?.phone, ...(q.lines || []).map((l) => l.description)],
  ).sort((a, b) => (opts.query ? 0 : time(b.createdAt) - time(a.createdAt)))
  return {
    total: hits.length,
    total_value: money(hits.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0)),
    results: hits.slice(0, MAX_RESULTS).map((q) => ({
      id: q.id,
      kind: "quotation",
      number: q.number,
      customer: who(q.customer),
      status: statusMeta(QUOTATION_STATUS, q.status).label,
      value: money(q.totals?.grandTotal),
      issued: q.issueDate ? formatDate(q.issueDate) : "not set",
      valid_until: q.validUntil ? formatDate(q.validUntil) : "not set",
      items: (q.lines || []).length,
    })),
  }
}

export function quotationDetail(q: QuotationRow) {
  return {
    id: q.id,
    kind: "quotation",
    number: q.number,
    status: statusMeta(QUOTATION_STATUS, q.status).label,
    customer: who(q.customer),
    contact: q.customer?.name || "not recorded",
    phone: q.customer?.phone || "not recorded",
    issued: q.issueDate ? formatDate(q.issueDate) : "not set",
    valid_until: q.validUntil ? formatDate(q.validUntil) : "not set",
    lines: (q.lines || []).slice(0, 12).map((l) => ({
      item: l.description || "unnamed item",
      quantity: `${l.quantity} ${l.unit || "pcs"}`,
      rate: money(l.rate),
      gst: `${l.gstRate}%`,
    })),
    taxable: money(q.totals?.taxable),
    discount: q.totals?.totalDiscount ? money(q.totals.totalDiscount) : "none",
    gst: `${money(q.totals?.gstTotal)}${q.totals?.interState ? " IGST" : " CGST plus SGST"}`,
    grand_total: money(q.totals?.grandTotal),
    lost_reason: q.lostReason || undefined,
  }
}

export function findProducts(products: ProductRow[], query: string) {
  const sellable = products.filter((p) => (p.status || "active") === "active")
  return ranked(sellable, query, (p) => [p.name, p.category, p.material, p.sku, p.description]).slice(0, MAX_RESULTS).map((p) => ({
    id: p.id,
    kind: "product",
    name: p.name,
    category: p.category || "uncategorised",
    material: p.material || "not recorded",
    price_ex_gst: money(p.basePrice),
    price_incl_gst: money((Number(p.basePrice) || 0) * (1 + (Number(p.gstRate) || 0) / 100)),
    gst: `${p.gstRate ?? 0}%`,
    minimum_order: p.moq ? `${p.moq} ${p.unit || "pcs"}` : "no minimum",
    dispatch_days: p.leadTimeDays || "not recorded",
  }))
}

/** Quoted value, won value and win rate over the last `days`. */
export function salesSummary(
  data: { quotations: QuotationRow[]; enquiries: EnquiryRow[] },
  days: number,
  access: Pick<Access, "enquiries" | "voice" | "quotations">,
  now = Date.now(),
) {
  const since = now - days * DAY_MS
  const out: Record<string, unknown> = { period: `the last ${days} days` }
  if (access.quotations) {
    const inPeriod = data.quotations.filter((q) => time(q.issueDate || q.createdAt) >= since && q.status !== "draft")
    const won = inPeriod.filter((q) => isWon(q.status))
    const decided = inPeriod.filter((q) => isWon(q.status) || q.status === "rejected" || q.status === "expired")
    out.quotations_sent = inPeriod.length
    out.quoted_value = money(inPeriod.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0))
    out.won = won.length
    out.won_value = money(won.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0))
    out.win_rate = decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : "no decisions yet"
    out.drafts_not_sent = data.quotations.filter((q) => q.status === "draft").length
  }
  if (access.enquiries) {
    out.website_enquiries = data.enquiries.filter((e) => e.source !== VOICE_SOURCE && time(e.createdAt) >= since).length
  }
  if (access.voice) {
    out.anu_calls = voiceCallsFrom(data.enquiries).filter((c) => time(c.endedAt) >= since).length
  }
  return out
}

// ---- quotation drafting ------------------------------------------------------

export type DraftItem = { product: string; quantity?: string | number }

/**
 * Lines for a new quotation from spoken items. A product that matches the
 * catalogue brings its own rate, HSN, GST and unit, with the quantity raised to
 * the minimum order (the editor's own `pickProduct` rule); one that does not is
 * kept as a described line at rate 0, so nothing the person asked for silently
 * disappears and the editor makes the missing price obvious.
 */
export function draftLines(products: ProductRow[], items: DraftItem[]): { lines: Line[]; unmatched: string[] } {
  const unmatched: string[] = []
  const lines = (items || [])
    .filter((it) => String(it.product || "").trim())
    .map((it) => {
      const qty = typeof it.quantity === "number" ? it.quantity : parseQuantity(String(it.quantity ?? "")) || 1
      const hit = findProductRows(products, it.product)[0]
      if (!hit) {
        unmatched.push(it.product)
        return newLine({ description: it.product, quantity: qty })
      }
      return newLine({
        productId: hit.id,
        description: hit.name,
        hsn: hit.hsn || "",
        unit: hit.unit || "pcs",
        rate: Number(hit.basePrice) || 0,
        gstRate: Number(hit.gstRate ?? 18),
        quantity: Math.max(qty, Number(hit.moq) || 0),
      })
    })
  return { lines, unmatched }
}

function findProductRows(products: ProductRow[], query: string) {
  return ranked(
    products.filter((p) => (p.status || "active") === "active"),
    query,
    (p) => [p.name, p.category, p.material, p.sku],
  )
}
