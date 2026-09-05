import { TELECALL_KINDS, TELECALL_OUTCOMES } from "../../data/domain/schema"

export const DAY_MS = 24 * 60 * 60 * 1000
export const OPEN_JOB = ["queued", "dialing", "in_progress"]

export const kindMeta = (id) => TELECALL_KINDS.find((k) => k.id === id) || TELECALL_KINDS[4]
export const outcomeMeta = (id) => TELECALL_OUTCOMES.find((o) => o.id === id) || { id, label: id || "-", tone: "slate" }

export function prettyPhone(phone = "") {
  const d = String(phone).replace(/\D/g, "").slice(-10)
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone
}

export const isValidMobile = (phone = "") => /^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, "").slice(-10))

/** Seconds → "3m 12s". */
export function duration(sec = 0) {
  const s = Math.max(0, Math.round(sec))
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

/** ISO → the value a datetime-local input expects, in local time. */
export function toLocalInput(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Outcomes that mean "the human team has something to do now".
export const ACTION_OUTCOMES = new Set(["deal_closed", "needs_quote", "complaint", "interested"])

/**
 * Build a dial target from a Voice Leads call (voice-leads/helpers groupIntoCalls
 * output) or a Lead record, so the "AI call" button works from either page.
 */
export function targetFromVoiceCall(call) {
  return {
    kind: "followup",
    phone: call.customer?.phone,
    contactName: call.named ? call.name : call.customer?.name || "",
    company: call.customer?.company || "",
    enquiryId: call.id,
    source: "voice-leads",
    context: {
      items: (call.itemsList || []).map((i) => ({ product: i.product, quantity: i.quantity, notes: i.notes })),
      productInterest: call.productInterest,
      quantity: call.quantity,
      timeline: call.timeline,
      city: call.customer?.address,
      summary: call.summary,
    },
  }
}

export function targetFromLead(lead) {
  return {
    kind: "followup",
    phone: lead.customer?.phone,
    contactName: lead.customer?.name || "",
    company: lead.customer?.company || "",
    leadId: lead.id,
    enquiryId: lead.enquiryId || null,
    source: "leads",
    context: {
      productInterest: lead.productInterest,
      quantity: lead.quantityEstimate,
      summary: lead.notes,
    },
  }
}
