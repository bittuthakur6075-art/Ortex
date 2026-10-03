import type { Enquiry, Quotation } from "@/domain/schema"
import type { VoiceCall } from "@/domain/voice"

/**
 * How the Quotations and Leads tabs group their rows (Figma "Quotations and
 * Leads · One UI lists"): what needs doing first, then today or this week, then
 * the rest. Pure, so the rules are tested (test/lists.test.mjs) and match Home:
 * a quote is expiring when it is SENT and lapses within 3 days (as
 * `attentionItems`); a lead is rung first by the console's `leadNextStep`
 * rules (a due follow-up, or still new), and won or lost ones close the list.
 */

const DAY = 86400000
const IST = 330 * 60000
const ms = (t: unknown) => {
  const v = new Date(t as string).getTime()
  return Number.isNaN(v) ? NaN : v
}
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)

export type ListSection<T> = { key: "first" | "recent" | "earlier" | "closed"; title: string; data: T[] }

const WON = new Set(["accepted", "invoiced"])
const OPEN = new Set(["draft", "sent"])
const CLOSED_LEAD = new Set(["won", "lost", "quoted"])
/** MIRROR of OPEN_LEAD in Admin lib/salesWork.js. */
const OPEN_LEAD = new Set(["new", "contacted", "qualified", "quoted"])
const WON_LOST = new Set(["won", "lost"])

/** Whole days until a sent quote lapses; null for anything else. */
export function quoteDaysLeft(q: Quotation, now = Date.now()): number | null {
  if (q.status !== "sent" || !q.validUntil) return null
  const t = ms(q.validUntil)
  return Number.isNaN(t) ? null : Math.ceil((t - now) / DAY)
}

export const isExpiring = (q: Quotation, now = Date.now()) => {
  const left = quoteDaysLeft(q, now)
  return left !== null && left >= 0 && left <= 3
}

const newestFirst = <T>(stamp: (x: T) => unknown) => (a: T, b: T) => (ms(stamp(b)) || 0) - (ms(stamp(a)) || 0)

function split<T>(
  items: T[],
  first: (x: T) => boolean,
  recent: (x: T) => boolean,
  titles: [string, string, string],
): ListSection<T>[] {
  const out: ListSection<T>[] = [
    { key: "first", title: titles[0], data: [] },
    { key: "recent", title: titles[1], data: [] },
    { key: "earlier", title: titles[2], data: [] },
  ]
  for (const x of items) out[first(x) ? 0 : recent(x) ? 1 : 2].data.push(x)
  return out.filter((s) => s.data.length)
}

/** Expiring Soon (soonest first), This Week, Earlier; newest first within each. */
export function quoteSections(quotes: Quotation[], now = Date.now()): ListSection<Quotation>[] {
  const sorted = [...quotes].sort(newestFirst((q) => q.createdAt))
  const sections = split(
    sorted,
    (q) => isExpiring(q, now),
    (q) => now - ms(q.createdAt) < 7 * DAY,
    ["Expiring Soon", "This Week", "Earlier"],
  )
  const exp = sections.find((s) => s.key === "first")
  exp?.data.sort((a, b) => (quoteDaysLeft(a, now) ?? 0) - (quoteDaysLeft(b, now) ?? 0))
  return sections
}

/** The three tiles over the list: open value, expiring, won this month. */
export function quoteSummary(quotes: Quotation[], now = Date.now()) {
  const month = istDay(now).slice(0, 7)
  const value = (q: Quotation) => Number(q.totals?.grandTotal) || 0
  const open = quotes.filter((q) => OPEN.has(q.status))
  const won = quotes.filter((q) => WON.has(q.status) && istDay(ms(q.issueDate || q.createdAt) || 0).slice(0, 7) === month)
  return {
    openValue: open.reduce((s, q) => s + value(q), 0),
    openCount: open.length,
    expiring: quotes.filter((q) => isExpiring(q, now)).length,
    wonValue: won.reduce((s, q) => s + value(q), 0),
    wonCount: won.length,
  }
}

type FollowUp = { followUpAt?: string | null }

/**
 * A person's own follow-up date always wins (Admin lib/salesWork.js
 * `leadNextStep`): true when it falls today or earlier (IST), false when it is
 * later, null when there is none and the status decides.
 */
export function followUpDue(x: FollowUp, now = Date.now()): boolean | null {
  const t = ms(x.followUpAt)
  if (!x.followUpAt || Number.isNaN(t)) return null
  return istDay(t) <= istDay(now)
}

/**
 * An enquiry to ring before anything else, by the console's rules: an open lead
 * whose follow-up is due today or overdue, or any NEW lead (the console wants
 * the first call within two hours) no older than a month (Home's window), so a
 * spreadsheet of last spring's leads does not bury this week's.
 */
export const enquiryCallFirst = (e: Enquiry & FollowUp, now = Date.now()) => {
  const status = e.status || "new"
  if (!OPEN_LEAD.has(status)) return false
  const due = followUpDue(e, now)
  if (due !== null) return due
  return status === "new" && now - ms(e.createdAt) <= 30 * DAY
}

/** A voice call to ring first: a due follow-up, a complaint, an urgent ask, or still new; within two weeks, as Home. */
export const callCallFirst = (c: VoiceCall, now = Date.now()) => {
  if (!OPEN_LEAD.has(c.status)) return false
  const due = followUpDue((c.rows?.[0] || {}) as FollowUp, now)
  if (due !== null) return due
  const age = now - ms(c.endedAt)
  return !CLOSED_LEAD.has(c.status) && age <= 14 * DAY && (c.flags.support || c.flags.urgent || c.status === "new")
}

/** The word a Call First row leads with: "Follow-up due", "Overdue" (new for 2 days or more) or "New". */
export function callFirstLabel(status: string, stamp: unknown, followUp: FollowUp, now = Date.now()): string {
  if (followUpDue(followUp, now)) return "Follow-up due"
  return (status || "new") === "new" && now - ms(stamp) >= 2 * DAY ? "Overdue" : "New"
}

/** Won and lost leave the working sections for a Closed one at the end. */
function withClosed<T extends { status?: string }>(sections: ListSection<T>[], closed: T[]): ListSection<T>[] {
  return closed.length ? [...sections, { key: "closed", title: "Closed", data: closed }] : sections
}

/** Call First, Today (IST day), Earlier, then Closed (won and lost). */
export function enquirySections(list: Enquiry[], now = Date.now()): ListSection<Enquiry>[] {
  const sorted = [...list].sort(newestFirst((e) => e.createdAt))
  const open = sorted.filter((e) => !WON_LOST.has(e.status))
  const sections = split(open, (e) => enquiryCallFirst(e, now), (e) => istDay(ms(e.createdAt) || 0) === istDay(now), [
    "Call First",
    "Today",
    "Earlier",
  ])
  return withClosed(sections, sorted.filter((e) => WON_LOST.has(e.status)))
}

export function callSections(list: VoiceCall[], now = Date.now()): ListSection<VoiceCall>[] {
  const sorted = [...list].sort(newestFirst((c) => c.endedAt))
  const open = sorted.filter((c) => !WON_LOST.has(c.status))
  const sections = split(open, (c) => callCallFirst(c, now), (c) => istDay(ms(c.endedAt) || 0) === istDay(now), [
    "Call First",
    "Today",
    "Earlier",
  ])
  return withClosed(sections, sorted.filter((c) => WON_LOST.has(c.status)))
}

/** Chip counts: how many rows carry each status. */
export function statusCounts<T extends { status?: string }>(items: T[], fallback = ""): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of items) {
    const s = x.status || fallback
    out[s] = (out[s] || 0) + 1
  }
  return out
}

/** "AP" for Apex Pharma, "R" for Rohit. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] || "") + (words[1]?.[0] || "")).toUpperCase() || "?"
}
