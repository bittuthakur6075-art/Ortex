// The notifications drawer's feed, as a pure function.
//
// A notification is DERIVED, not stored: a view of the rows the console already
// holds (enquiries, leads, quotations, invoices, payments), so it needs no
// table, can never drift from the record it describes, and disappears by itself
// once the record moves on. Sibling of Ortex.Mobile/src/domain/notifications.ts,
// whose voice and stale-enquiry signals (and windows) this follows.
//
// Ids are deterministic (record id + signal) because the drawer keys its
// read/archived flags in localStorage on them: changing an existing id resets
// every user's flags for that signal.
//
// Items are plain data so this file stays testable without JSX. `title` is a
// list of parts: a string is plain text, `{ b: "text" }` is bold.

import { OPEN_LEAD_STAGES, LEAD_STAGES } from "../data/domain/schema"
import { canAccess } from "../data/domain/modules"
import { formatCurrency, formatDate } from "./format"
import { VOICE_SOURCE, prettyPhone } from "../pages/voice-leads/helpers"
import { voiceCalls } from "./analytics/today"

export const DAY_MS = 86400000

/** A new enquiry older than this has gone cold. Matches the lead advisory. */
export const STALE_DAYS = 2

/** How far back enquiry and voice signals reach; older is a list, not news. */
export const WINDOW_DAYS = 14

const stageLabel = (stage) => LEAD_STAGES.find((s) => s.id === stage)?.label || stage
const partyName = (c) => c?.name || c?.company || "Unknown contact"
const partyCompany = (c) => (c?.company && c.company !== c.name ? c.company : "")
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const b = (text) => ({ b: text })

/** Whole days from `now` to `ts`, both floored to local midnight. */
export function daysUntilAt(ts, now) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / DAY_MS)
}

/** What each signal needs, from a profile. Leads ride on the enquiries grant. */
export function accessFor(profile) {
  return {
    enquiries: canAccess(profile, "enquiries"),
    voice: canAccess(profile, "voice-leads"),
    quotations: canAccess(profile, "quotations"),
    invoices: canAccess(profile, "invoices"),
    payments: canAccess(profile, "payments"),
  }
}

const ALL_ACCESS = { enquiries: true, voice: true, quotations: true, invoices: true, payments: true }

const itemsLine = (items) =>
  (items || [])
    .map((i) => [i.quantity, i.product].filter(Boolean).join(" x "))
    .filter(Boolean)
    .join(", ")

function enquirySignals(enquiries, now) {
  const out = []
  for (const e of enquiries) {
    // Anu's capture rows are folded into calls below; listing them here as well
    // announced one conversation up to four times.
    if (e.source === VOICE_SOURCE || e.status !== "new") continue
    const created = new Date(e.createdAt || now).getTime()
    if (Number.isNaN(created) || now - created > WINDOW_DAYS * DAY_MS) continue

    const name = partyName(e.customer)
    const company = partyCompany(e.customer)
    const phone = e.customer?.phone || ""
    const city = (e.customer?.address || "").split(",")[0].trim()
    const wanted = itemsLine(Array.isArray(e.items) ? e.items : []) || e.productInterest || ""
    const days = Math.floor((now - created) / DAY_MS)
    const to = `/enquiries/${e.id}`

    out.push({
      id: `enq-new-${e.id}`,
      kind: "enquiry-new",
      module: "Enquiries",
      tone: "primary",
      avatar: name,
      when: e.createdAt,
      title: [b(name), ...(company ? [" from ", b(company)] : []), " sent a new enquiry", ...(e.productInterest ? [" for ", b(e.productInterest)] : [])],
      quote: e.message,
      tags: [e.source, city].filter(Boolean),
      phone,
      primary: { label: "Open enquiry", to },
    })

    // Still new after two days: said once a day, like the phone, so a lead
    // left alone keeps asking rather than being read once and forgotten.
    if (days >= STALE_DAYS) {
      out.push({
        id: `enq-stale-${e.id}-${Math.floor(created / DAY_MS)}-${days}`,
        kind: "enquiry-stale",
        module: "Enquiries",
        tone: "amber",
        avatar: name,
        when: new Date(created + STALE_DAYS * DAY_MS).toISOString(),
        urgent: true,
        title: [b(name), " is still waiting. No one has touched this enquiry since it arrived ", b(`${plural(days, "day")} ago`)],
        detail: [wanted, phone ? prettyPhone(phone) : "No number", city].filter(Boolean).join(" · "),
        tags: [e.source].filter(Boolean),
        phone,
        primary: { label: "Open enquiry", to },
      })
    }
  }
  return out
}

function voiceSignals(enquiries, now) {
  const out = []
  for (const call of voiceCalls(enquiries)) {
    if (call.status !== "new") continue
    const ended = new Date(call.endedAt || call.startedAt || now).getTime()
    if (Number.isNaN(ended) || now - ended > WINDOW_DAYS * DAY_MS) continue

    const phone = call.customer.phone || ""
    const support = call.flags.support
    const urgent = call.flags.urgent
    const wanted = itemsLine(call.itemsList) || call.productInterest || "Nothing captured"
    const detail = [
      wanted,
      phone ? prettyPhone(phone) : "No number",
      call.customer.address ? call.customer.address.split(",")[0].trim() : null,
      call.timeline,
      call.flags.hugeQty ? "quantity needs confirming" : null,
      call.flags.incomplete ? "no quantity given" : null,
      !call.named ? "name not captured" : null,
    ]
      .filter(Boolean)
      .join(" · ")

    out.push({
      id: `voice-${support ? "support" : "new"}-${call.id}`,
      kind: support ? "voice-support" : "voice-new",
      module: "Voice calls",
      // A complaint that reads as buying intent is the worst thing this feed can
      // hand someone, so it has its own kind, tone and wording, and sorts first.
      tone: support ? "rose" : urgent ? "amber" : "primary",
      avatar: call.name,
      when: call.endedAt,
      urgent: support || urgent,
      pinned: support,
      title: support
        ? [b(call.name), " called Anu about a problem"]
        : urgent
          ? [b(call.name), " needs it ", b("urgently")]
          : [b(call.name), " spoke to Anu"],
      detail: support ? `Support, not a sale. ${detail}` : detail,
      tags: [
        support ? { label: "Complaint", tone: "rose" } : null,
        urgent ? { label: "Urgent", tone: "amber" } : null,
        call.flags.hugeQty ? "Check quantity" : null,
        call.captures > 1 ? `${call.captures} captures` : null,
      ].filter(Boolean),
      phone,
      primary: { label: "Open call", to: "/crm?tab=voice", state: { openId: call.id } },
    })
  }
  return out
}

/**
 * The whole feed. Complaint calls first, then newest first. `access` mirrors
 * canAccess per module (see accessFor), so nobody is told about a record RLS
 * would refuse to open.
 */
export function buildFeed(data = {}, { access = ALL_ACCESS, now = Date.now() } = {}) {
  const out = []

  if (access.enquiries) out.push(...enquirySignals(data.enquiries || [], now))
  if (access.voice) out.push(...voiceSignals(data.enquiries || [], now))

  if (access.enquiries) {
    for (const l of data.leads || []) {
      if (!OPEN_LEAD_STAGES.includes(l.stage) || !l.nextFollowUp) continue
      const days = daysUntilAt(l.nextFollowUp, now)
      if (days === null || days > 0) continue
      const name = partyName(l.customer)
      const company = partyCompany(l.customer)
      const overdue = days < 0
      out.push({
        id: `lead-fu-${l.id}-${l.nextFollowUp}`,
        kind: "lead-followup",
        module: "Leads",
        avatar: name,
        when: l.nextFollowUp,
        urgent: overdue,
        title: ["Follow-up with ", b(name), ...(company ? [` (${company})`] : []), " ", ...(overdue ? ["is ", b(`overdue by ${plural(-days, "day")}`)] : ["is ", b("due today")])],
        tags: [stageLabel(l.stage), l.quantityEstimate, l.estimatedValue ? formatCurrency(l.estimatedValue) : null].filter(Boolean),
        primary: { label: "Open enquiry", to: "/crm?tab=enquiries" },
      })
    }
  }

  if (access.quotations) {
    for (const q of data.quotations || []) {
      if (q.status !== "sent" || !q.validUntil) continue
      const days = daysUntilAt(q.validUntil, now)
      if (days === null || days > 3) continue
      const name = partyName(q.customer)
      out.push({
        id: `qtn-exp-${q.id}-${q.validUntil}`,
        kind: days < 0 ? "quotation-expired" : "quotation-expiring",
        module: "Quotations",
        avatar: name,
        when: q.validUntil,
        urgent: days < 0,
        title: ["Quotation ", b(q.number), " for ", b(name), " ", ...(days < 0 ? ["expired ", b(`${plural(-days, "day")} ago`)] : days === 0 ? ["expires ", b("today")] : ["expires in ", b(plural(days, "day"))])],
        amount: { label: "Quote value", value: q.totals?.grandTotal, sub: `Valid till ${formatDate(q.validUntil)}` },
        primary: { label: "View quotation", to: "/quotations" },
      })
    }
  }

  if (access.invoices) {
    for (const inv of data.invoices || []) {
      if (!inv.dueDate || ["paid", "cancelled", "draft"].includes(inv.status)) continue
      const days = daysUntilAt(inv.dueDate, now)
      if (days === null) continue
      const overdue = inv.status === "overdue" || days < 0
      if (!overdue && days > 3) continue
      const name = partyName(inv.customer)
      const due = Math.max(0, (inv.totals?.grandTotal || 0) - (inv.amountPaid || 0))
      out.push({
        id: `inv-due-${inv.id}-${inv.dueDate}`,
        kind: "invoice-due",
        module: "Invoices",
        avatar: name,
        when: inv.dueDate,
        urgent: overdue,
        title: ["Invoice ", b(inv.number), " for ", b(name), " ", ...(overdue ? ["is ", b(`overdue by ${plural(Math.max(1, -days), "day")}`)] : days === 0 ? ["is ", b("due today")] : ["is due in ", b(plural(days, "day"))])],
        amount: { label: "Balance due", value: due, sub: inv.status === "partial" ? "Partially paid" : "Unpaid" },
        primary: { label: "View invoice", to: "/billing?tab=invoices" },
      })
    }
  }

  if (access.payments) {
    const weekAgo = now - 7 * DAY_MS
    for (const p of data.payments || []) {
      if (p.type !== "inflow" || !p.date || new Date(p.date).getTime() < weekAgo) continue
      const name = p.party || partyName(p.customer)
      out.push({
        id: `pay-in-${p.id}`,
        kind: "payment-in",
        module: "Payments",
        avatar: name,
        when: p.date,
        title: [b(name), " paid ", b(formatCurrency(p.amount)), ...(p.method ? [` via ${p.method}`] : []), ...(p.invoiceNumber ? [" against ", b(p.invoiceNumber)] : [])],
        tags: [p.reference, p.note].filter(Boolean),
        primary: { label: "View payment", to: "/billing?tab=payments" },
      })
    }
  }

  return out.sort((x, y) => Number(Boolean(y.pinned)) - Number(Boolean(x.pinned)) || new Date(y.when || 0) - new Date(x.when || 0))
}
