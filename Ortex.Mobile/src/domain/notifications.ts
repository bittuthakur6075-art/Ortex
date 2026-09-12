// What the phone should tell a rep about, without being asked.
//
// SIBLING OF Ortex.Admin/src/components/layout/NotificationsDrawer.jsx — the
// console builds the same kind of feed from live business signals rather than
// from a server-side inbox, and so does this. There is no `notifications` table
// to read: a notification IS a derived view of the rows the app already has, so
// it costs no migration, can never drift from the record it describes, and
// disappears by itself the moment the underlying record moves on.
//
// Two deliberate differences from the console's version:
//
//   · The signals are only the ones the PHONE has collections for — enquiries,
//     voice calls and quotations. Invoices, payments and the leads pipeline stay
//     in the console, and a notification about a record this app cannot open is
//     a dead end in the hand.
//   · Every item is plain data (strings, no JSX) and carries `push`, the title
//     and body a local notification is posted with, plus the ACTIONS a rep can
//     take from the notification shade — ring the customer, WhatsApp them, open
//     the record. That is the whole point of a push on a field-sales phone: the
//     answer is "call them back", and it should not require opening the app to
//     find the number.
//
// Pure: no React, no React Native, no theme. `test/notifications.test.mjs`
// loads it in plain Node through test/loadTs.mjs.

import { formatCurrency, formatNumber } from "@/domain/format"
import { parseQuoteRfq, rfqUnits, type Rfq } from "@/domain/quoteRfq"
import type { Enquiry, Quotation } from "@/domain/schema"
import { VOICE_SOURCE, prettyPhone, voiceCallsFrom, type VoiceCall } from "@/domain/voice"

export type NotificationKind =
  | "enquiry-new"
  | "enquiry-stale"
  | "voice-new"
  | "voice-support"
  | "quotation-expiring"
  | "quotation-expired"

/** A notification tone, in the theme's own status vocabulary. */
export type NotificationTone = "primary" | "amber" | "rose"

export type NotificationActionId = "open" | "call" | "whatsapp"

export type NotificationAction = {
  id: NotificationActionId
  label: string
  /** 10-digit national number, for `call` / `whatsapp`. */
  phone?: string
}

export type NotificationTarget =
  | { screen: "EnquiryDetail"; id: string }
  | { screen: "VoiceCallDetail"; id: string }
  | { screen: "QuotationDetail"; id: string }

export type AppNotification = {
  /**
   * Deterministic — built from the record id plus the signal, never a random
   * uuid — so a read flag, and the "already pushed" mark, survive a reload and
   * the same signal is never announced twice.
   */
  id: string
  kind: NotificationKind
  /** The module a row belongs to, shown as its meta line. */
  module: string
  icon: "enquiry" | "voice" | "quote" | "clock"
  tone: NotificationTone
  /** ISO stamp the feed sorts on, and the row shows as "2h ago". */
  when: string
  urgent: boolean
  /** One line: who, and what happened. */
  title: string
  /** The detail line — what they want, how much, by when. */
  body: string
  /** Short facts drawn as chips under the body. */
  facts: string[]
  /** The figure, where the signal has one. */
  value?: number
  customerName: string
  /** National 10-digit number, or "" when the lead never gave one. */
  phone: string
  target: NotificationTarget
  actions: NotificationAction[]
  /** What the OS notification carries. Title stays short; body carries it all. */
  push: { title: string; body: string }
}

/** Which signals a rep has switched on. Mirrored by DEFAULT_PREFS below. */
export type NotificationPrefs = {
  enabled: boolean
  enquiries: boolean
  voice: boolean
  stale: boolean
  quotations: boolean
}

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  enquiries: true,
  voice: true,
  stale: true,
  quotations: true,
}

/** Every switchable signal, for the settings screen. */
export const NOTIFICATION_SETTINGS: {
  key: keyof Omit<NotificationPrefs, "enabled">
  label: string
  hint: string
}[] = [
  { key: "enquiries", label: "New enquiries", hint: "Website forms and the quote calculator" },
  { key: "voice", label: "Voice calls", hint: "Leads Anu captures on a call" },
  { key: "stale", label: "Enquiries going cold", hint: "Still new after two days" },
  { key: "quotations", label: "Quotation validity", hint: "Sent quotes about to expire" },
]

const DAY_MS = 86400000

/** A quotation this far from expiry starts warning. */
const EXPIRY_WINDOW_DAYS = 3

/** A new enquiry older than this has gone cold. Matches the console's advisory. */
const STALE_DAYS = 2

/**
 * How far back the feed reaches. A rep opening the app after a week away wants
 * this week's leads, not a scroll through the quarter — and anything older is
 * a list, not a notification.
 */
const WINDOW_DAYS = 14

const iso = (ts: unknown, fallback: number): string => {
  const d = new Date((ts as string) || fallback)
  return Number.isNaN(d.getTime()) ? new Date(fallback).toISOString() : d.toISOString()
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const partyName = (c?: { name?: string; company?: string } | null) =>
  c?.name || c?.company || "Unknown contact"

/** The company, only when it says something the name did not. */
const partyCompany = (c?: { name?: string; company?: string } | null) =>
  c?.company && c.company !== c.name ? c.company : ""

/** Strip +91 / leading 0 the way lib/contact.ts does, so `tel:` always works. */
function nationalDigits(phone = ""): string {
  const digits = String(phone).replace(/\D/g, "")
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  return digits.slice(-10)
}

/**
 * Ring / WhatsApp / open, in the order a rep uses them. A lead with no number
 * gets "Open" alone rather than two buttons that cannot do anything — a dead
 * action in the notification shade is worse than no action.
 */
function actionsFor(phone: string, openLabel: string): NotificationAction[] {
  const out: NotificationAction[] = []
  if (phone) {
    out.push({ id: "call", label: "Call", phone })
    out.push({ id: "whatsapp", label: "WhatsApp", phone })
  }
  out.push({ id: "open", label: openLabel })
  return out
}

/** What the website's RFQ builder sent, as one readable line. */
function rfqLine(rfq: Rfq | null): string {
  if (!rfq?.items?.length) return ""
  return `${plural(rfq.items.length, "item")} · ${formatNumber(rfqUnits(rfq.items))} pcs`
}

function enquiryItemsLine(e: Enquiry): string {
  const items = Array.isArray(e.items) ? e.items : []
  if (items.length) {
    return items
      .map((i) => [i.quantity, i.product].filter(Boolean).join(" x "))
      .filter(Boolean)
      .join(", ")
  }
  return e.productInterest || ""
}

// ---- the signals ------------------------------------------------------------

function enquiryNotifications(
  enquiries: Enquiry[],
  now: number,
  prefs: NotificationPrefs,
): AppNotification[] {
  const out: AppNotification[] = []

  for (const e of enquiries) {
    const created = new Date((e.createdAt as string) || now).getTime()
    if (Number.isNaN(created) || now - created > WINDOW_DAYS * DAY_MS) continue

    const name = partyName(e.customer)
    const company = partyCompany(e.customer)
    const phone = nationalDigits(e.customer?.phone)
    const rfq = parseQuoteRfq(e)
    const wanted = rfqLine(rfq) || enquiryItemsLine(e)
    // There is no `city` column on a customer — the website writes the delivery
    // place into the address, so the first segment of it is the place to name.
    const city = (e.customer?.address || "").split(",")[0].trim()
    const days = Math.floor((now - created) / DAY_MS)

    if (prefs.enquiries && e.status === "new") {
      const detail = [
        wanted || "Nothing captured yet",
        phone ? prettyPhone(phone) : "No number",
        city,
        e.source,
      ]
        .filter(Boolean)
        .join(" · ")

      out.push({
        id: `enq-new-${e.id}`,
        kind: "enquiry-new",
        module: "Enquiries",
        icon: rfq ? "quote" : "enquiry",
        tone: "primary",
        when: iso(e.createdAt, created),
        urgent: false,
        title: company ? `New enquiry from ${name} (${company})` : `New enquiry from ${name}`,
        body: detail,
        facts: [
          e.source,
          city,
          rfq ? `${plural(rfq.items.length, "line")}` : null,
          rfq ? `${formatNumber(rfqUnits(rfq.items))} pcs` : null,
        ].filter(Boolean) as string[],
        customerName: name,
        phone,
        target: { screen: "EnquiryDetail", id: e.id },
        actions: actionsFor(phone, "Open enquiry"),
        push: {
          title: company ? `New enquiry · ${name} (${company})` : `New enquiry · ${name}`,
          body: detail,
        },
      })
    }

    // Still new after two days: the same advisory the lead pages carry, said
    // once rather than only when somebody happens to open the record.
    if (prefs.stale && e.status === "new" && days >= STALE_DAYS) {
      const detail = [
        `No one has touched it since it arrived ${plural(days, "day")} ago`,
        wanted,
        phone ? prettyPhone(phone) : "No number",
      ]
        .filter(Boolean)
        .join(" · ")

      out.push({
        // The day is part of the id, so a lead left alone keeps asking — once
        // a day, not once a render.
        id: `enq-stale-${e.id}-${Math.floor(created / DAY_MS)}-${days}`,
        kind: "enquiry-stale",
        module: "Enquiries",
        icon: "clock",
        tone: "amber",
        when: iso(new Date(created + STALE_DAYS * DAY_MS).toISOString(), now),
        urgent: true,
        title: `${name} is still waiting`,
        body: detail,
        facts: [`${plural(days, "day")} old`, e.source, city].filter(Boolean) as string[],
        customerName: name,
        phone,
        target: { screen: "EnquiryDetail", id: e.id },
        actions: actionsFor(phone, "Open enquiry"),
        push: { title: `Enquiry going cold · ${name}`, body: detail },
      })
    }
  }

  return out
}

function voiceNotifications(calls: VoiceCall[], now: number): AppNotification[] {
  const out: AppNotification[] = []

  for (const call of calls) {
    const ended = new Date(call.endedAt || call.startedAt || now).getTime()
    if (Number.isNaN(ended) || now - ended > WINDOW_DAYS * DAY_MS) continue
    if (call.status !== "new") continue

    const phone = nationalDigits(call.customer.phone)
    const wanted = call.itemsList.length
      ? call.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join(", ")
      : call.productInterest || "Nothing captured"

    // A complaint that reads as buying intent is the worst thing this feed can
    // hand a rep, so it is its own kind, its own tone and its own wording.
    const support = call.flags.support
    const detail = [
      wanted,
      phone ? prettyPhone(phone) : "No number",
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
      icon: "voice",
      tone: support ? "rose" : call.flags.urgent ? "amber" : "primary",
      when: iso(call.endedAt, ended),
      urgent: support || call.flags.urgent,
      title: support
        ? `${call.name} called about a problem`
        : call.flags.urgent
          ? `${call.name} needs it urgently`
          : `Anu captured a lead from ${call.name}`,
      body: support ? `Support, not a sale. ${detail}` : detail,
      facts: [
        support ? "Support" : null,
        call.flags.urgent ? "Urgent" : null,
        call.flags.hugeQty ? "Check quantity" : null,
        call.captures > 1 ? `${call.captures} captures` : null,
      ].filter(Boolean) as string[],
      customerName: call.name,
      phone,
      target: { screen: "VoiceCallDetail", id: call.id },
      actions: actionsFor(phone, "Open call"),
      push: {
        title: support
          ? `Complaint · ${call.name}`
          : call.flags.urgent
            ? `Urgent voice lead · ${call.name}`
            : `Voice lead · ${call.name}`,
        body: support ? `Support, not a sale. ${detail}` : detail,
      },
    })
  }

  return out
}

function quotationNotifications(quotations: Quotation[], now: number): AppNotification[] {
  const out: AppNotification[] = []

  for (const q of quotations) {
    if (q.status !== "sent" || !q.validUntil) continue
    const due = new Date(q.validUntil).getTime()
    if (Number.isNaN(due)) continue

    // Whole days, both dates floored to midnight — a quote expiring tonight is
    // "today", not "in 0.4 days".
    const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS)
    if (days > EXPIRY_WINDOW_DAYS) continue
    // An expired quote is worth chasing for a fortnight, not forever.
    if (days < -WINDOW_DAYS) continue

    const name = partyName(q.customer)
    const phone = nationalDigits(q.customer?.phone)
    const total = q.totals?.grandTotal || 0
    const expired = days < 0
    const timing = expired
      ? `expired ${plural(-days, "day")} ago`
      : days === 0
        ? "expires today"
        : `expires in ${plural(days, "day")}`

    const detail = [
      `${formatCurrency(total)} · ${timing}`,
      `${plural(q.lines?.length || 0, "line")}`,
      phone ? prettyPhone(phone) : null,
    ]
      .filter(Boolean)
      .join(" · ")

    out.push({
      // The validity date is in the id, so extending a quotation retires the
      // old warning instead of leaving it read and stale.
      id: `qtn-exp-${q.id}-${q.validUntil}`,
      kind: expired ? "quotation-expired" : "quotation-expiring",
      module: "Quotations",
      icon: "quote",
      tone: expired ? "rose" : "amber",
      when: iso(q.validUntil, due),
      urgent: expired,
      title: `${q.number} for ${name} ${timing}`,
      body: detail,
      facts: [q.number, timing].filter(Boolean),
      value: total,
      customerName: name,
      phone,
      target: { screen: "QuotationDetail", id: q.id },
      actions: actionsFor(phone, "View quotation"),
      push: { title: `Quotation ${timing} · ${name}`, body: detail },
    })
  }

  return out
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---- the feed ---------------------------------------------------------------

export type FeedInput = {
  enquiries?: Enquiry[]
  quotations?: Quotation[]
  /** Frozen "now", so a test is not a clock race. */
  now?: number
  prefs?: NotificationPrefs
}

/**
 * The whole feed, newest first. Voice calls are folded out of the same
 * `enquiries` collection the console folds them from (`voiceCallsFrom`), so a
 * three-capture conversation is ONE notification rather than three.
 */
export function buildNotifications({
  enquiries = [],
  quotations = [],
  now = Date.now(),
  prefs = DEFAULT_PREFS,
}: FeedInput): AppNotification[] {
  if (!prefs.enabled) return []

  const webEnquiries = enquiries.filter((e) => e.source !== VOICE_SOURCE)
  const calls = prefs.voice ? voiceCallsFrom(enquiries) : []

  const out = [
    ...enquiryNotifications(webEnquiries, now, prefs),
    ...voiceNotifications(calls, now),
    ...(prefs.quotations ? quotationNotifications(quotations, now) : []),
  ]

  return out.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
}
