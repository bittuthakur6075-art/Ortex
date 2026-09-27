// "What do I do next, and by when" for a lead (an enquiry row) and for a
// quotation: the Next step / Follow-up columns, the groups both V2 lists sort
// into, and the smart-view counts above them. Pure, and every function takes
// `now`, so the tests are not a race with the clock.
//
// A person's own date always wins: `followUpAt` on the doc is written by
// Snooze / Set follow-up. Without one the date is derived from the status, so a
// list that nobody has touched still says what is late.

import { rfqArtwork, parseQuoteRfq, isQuoteEnquiry } from "./quoteRfq"
import { VOICE_SOURCE, flagsFor } from "../pages/voice-leads/helpers"

export const HOUR = 3600000
export const DAY = 24 * HOUR

export const OPEN_LEAD = ["new", "contacted", "qualified", "quoted"]

// Whole rupees, as both lists print money: "₹48,600".
export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

const startOfDay = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Tomorrow at 10 am: what Snooze and "Set follow-up" write.
export function tomorrowAt10(now = Date.now()) {
  const d = new Date(startOfDay(now) + DAY)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

const time = (ts) => {
  const t = new Date(ts || 0).getTime()
  return Number.isNaN(t) ? 0 : t
}

// Support-looking text (a refund, a damaged order) reuses the voice page's
// flags, so "Support" means the same thing on the Voice calls tab and here.
export function leadFlags(e) {
  const f = flagsFor({
    rows: [{ summary: `${e.message || ""} ${e.notes && !parseQuoteRfq(e) ? e.notes : ""}`, quantity: e.quantity || "", timeline: "", productInterest: e.productInterest || "" }],
    itemsList: [],
    quantity: e.quantity || "",
    timeline: "",
  })
  const art = rfqArtwork(e)
  const qty = String(e.quantity || "").trim()
  return {
    support: f.support,
    urgent: f.urgent,
    verifyQty: f.hugeQty || (qty !== "" && !/^\d[\d,]*$/.test(qty)),
    artwork: art ? (art.failed ? "missing" : "attached") : null,
    voice: e.source === VOICE_SOURCE,
    quote: isQuoteEnquiry(e),
  }
}

// { label, due (ms), overdue, today } or null for a closed lead.
export function leadNextStep(e, now = Date.now()) {
  if (!OPEN_LEAD.includes(e.status || "new")) return null
  const flags = leadFlags(e)
  const created = time(e.createdAt || e.submittedAt) || now
  const touched = time(e.updatedAt) || created
  let label
  let due
  switch (e.status || "new") {
    case "new":
      label = flags.support ? "Hand to accounts" : flags.voice ? "Call back (Anu call)" : "First call"
      due = created + 2 * HOUR
      break
    case "contacted":
      label = flags.verifyQty ? "Confirm real quantity" : e.quantity || parseQuoteRfq(e) ? "Send quotation" : "Ask for quantity"
      due = touched + DAY
      break
    case "qualified":
      label = "Send quotation"
      due = touched + DAY
      break
    default: // quoted
      label = "Chase quotation"
      due = touched + 3 * DAY
  }
  if (e.followUpAt) due = time(e.followUpAt)
  if (e.nextStep) label = e.nextStep
  return { label, due, ...dueState(due, now) }
}

function dueState(due, now) {
  return { overdue: due < now, today: due >= now && startOfDay(due) === startOfDay(now) }
}

// "Overdue 3 days", "Overdue 5 hours", "Today, 4:30 pm", "Tomorrow", "Mon, 29 Sep".
export function dueLabel(due, now = Date.now()) {
  if (due < now) {
    const days = Math.floor((startOfDay(now) - startOfDay(due)) / DAY)
    if (days >= 1) return `Overdue ${days} day${days === 1 ? "" : "s"}`
    const hours = Math.max(1, Math.floor((now - due) / HOUR))
    return `Overdue ${hours} hour${hours === 1 ? "" : "s"}`
  }
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY)
  const clock = new Date(due).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()
  if (days === 0) return `Today, ${clock}`
  if (days === 1) return "Tomorrow"
  return new Date(due).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
}

export const LEAD_GROUPS = [
  { key: "overdue", label: "Overdue", tone: "rose", hint: "Oldest first" },
  { key: "today", label: "Due today", tone: "amber" },
  { key: "upcoming", label: "Upcoming", tone: "slate" },
  { key: "closed", label: "Closed", tone: "slate" },
]

export function leadGroup(step) {
  if (!step) return "closed"
  if (step.overdue) return "overdue"
  if (step.today) return "today"
  return "upcoming"
}

// ---- quotations ------------------------------------------------------------

// Status as shown: a sent quotation past its validity reads "expired" without a
// background job rewriting the stored row (same rule as the old list).
export function quoteStatus(q, now = Date.now()) {
  if (q.status !== "sent" || !q.validUntil) return q.status
  return time(q.validUntil) < startOfDay(now) ? "expired" : q.status
}

// Whole days of validity left (negative once lapsed), or null with no date.
export function validityLeft(q, now = Date.now()) {
  if (!q.validUntil) return null
  return Math.round((startOfDay(q.validUntil) - startOfDay(now)) / DAY)
}

// { label, due, overdue, today, group } for a quotation. Groups: "needs"
// (a draft to send, an overdue follow-up, an acceptance to bill), "waiting"
// (sent, follow-up not yet due) and "closed".
export function quoteFollowUp(q, now = Date.now()) {
  const status = quoteStatus(q, now)
  if (status === "draft") {
    const due = q.followUpAt ? time(q.followUpAt) : time(q.createdAt || q.issueDate) || now
    return { label: "Send today", due, ...dueState(due, now), group: "needs", action: "send" }
  }
  if (status === "accepted") {
    return { label: "Convert to invoice", due: now, overdue: false, today: true, group: "needs", action: "invoice" }
  }
  if (status === "sent") {
    const due = q.followUpAt ? time(q.followUpAt) : (time(q.sentAt || q.issueDate) || now) + 3 * DAY
    const s = dueState(due, now)
    return { label: s.overdue ? dueLabel(due, now) : s.today ? "Follow up today" : dueLabel(due, now), due, ...s, group: s.overdue || s.today ? "needs" : "waiting", action: "remind" }
  }
  if (status === "expired") return { label: "Lapsed, revise", due: null, overdue: false, today: false, group: "closed", action: "revise" }
  return { label: "", due: null, overdue: false, today: false, group: "closed", action: null }
}

export const QUOTE_TONE = { draft: "slate", sent: "blue", accepted: "emerald", rejected: "rose", expired: "amber", invoiced: "violet" }

export const QUOTE_GROUPS = [
  { key: "needs", label: "Needs you", tone: "rose", hint: "Drafts, overdue follow-ups and accepted quotes to bill" },
  { key: "waiting", label: "Waiting on customer", tone: "blue" },
  { key: "closed", label: "Closed", tone: "slate" },
]

// "Before you send": what a quotation needs before it reaches a customer.
// [{ key, ok, text }], in the order the card shows them. `guidePct` is the
// discount a rep may give without an admin noticing (settings.quotation).
export function quoteChecks(q, settings, now = Date.now()) {
  const c = q.customer || {}
  const lines = (q.lines || []).filter((l) => l.description || l.quantity)
  const gstin = (c.gstin || "").trim()
  const guide = Number(settings?.quotation?.discountGuidePct ?? 5)
  const overGuide = lines.filter((l) => Number(l.discountPercent) > guide)
  const co = settings?.company || {}
  const left = validityLeft({ validUntil: q.validUntil }, now)
  return [
    { key: "customer", ok: Boolean(c.name?.trim() || c.company?.trim()), text: "Customer named" },
    { key: "gst", ok: Boolean(c.stateCode || gstin), text: gstin ? "GSTIN given, place of supply set" : "Place of supply set" },
    { key: "hsn", ok: lines.length > 0 && lines.every((l) => l.hsn && l.gstRate !== "" && l.gstRate != null), text: "HSN and GST rate on every line" },
    { key: "bank", ok: Boolean((co.bankAccount && co.bankIfsc) || co.upi), text: "Bank or UPI details on the document" },
    ...(overGuide.length ? [{ key: "discount", ok: false, warn: true, text: `${overGuide.length === 1 ? (overGuide[0].description || "A line").split(",")[0] : `${overGuide.length} lines`}: discount above your ${guide}% guide` }] : []),
    ...(left != null && left < 0 ? [{ key: "validity", ok: false, text: "Validity has lapsed. Extend it first." }] : []),
  ]
}
