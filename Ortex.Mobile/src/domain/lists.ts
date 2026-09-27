import type { Enquiry, Quotation } from "@/domain/schema"
import type { VoiceCall } from "@/domain/voice"

/**
 * How the Quotations and Leads tabs group their rows (Figma "Quotations and
 * Leads · One UI lists"): what needs doing first, then today or this week, then
 * the rest. Pure, so the rules are tested (test/lists.test.mjs) and match Home:
 * a quote is expiring when it is SENT and lapses within 3 days (as
 * `attentionItems`), an enquiry is overdue once it has sat NEW for 2 days (as
 * `enquiryAge`).
 */

const DAY = 86400000
const IST = 330 * 60000
const ms = (t: unknown) => {
  const v = new Date(t as string).getTime()
  return Number.isNaN(v) ? NaN : v
}
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10)

export type ListSection<T> = { key: "first" | "recent" | "earlier"; title: string; data: T[] }

const WON = new Set(["accepted", "invoiced"])
const OPEN = new Set(["draft", "sent"])
const CLOSED_LEAD = new Set(["won", "lost", "quoted"])

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

/**
 * An enquiry to ring before anything else: still NEW after two days, and no
 * older than a month (Home's window), so a spreadsheet of last spring's leads
 * does not bury this week's under "Overdue".
 */
export const enquiryCallFirst = (e: Enquiry, now = Date.now()) => {
  const age = now - ms(e.createdAt)
  return (e.status || "new") === "new" && age >= 2 * DAY && age <= 30 * DAY
}

/** A voice call to ring first: a complaint, an urgent ask, or two days unanswered; within two weeks, as Home. */
export const callCallFirst = (c: VoiceCall, now = Date.now()) => {
  const age = now - ms(c.endedAt)
  return (
    !CLOSED_LEAD.has(c.status) &&
    age <= 14 * DAY &&
    (c.flags.support || c.flags.urgent || (c.status === "new" && age >= 2 * DAY))
  )
}

/** Call First, Today (IST day), Earlier. */
export function enquirySections(list: Enquiry[], now = Date.now()): ListSection<Enquiry>[] {
  const sorted = [...list].sort(newestFirst((e) => e.createdAt))
  return split(sorted, (e) => enquiryCallFirst(e, now), (e) => istDay(ms(e.createdAt) || 0) === istDay(now), [
    "Call First",
    "Today",
    "Earlier",
  ])
}

export function callSections(list: VoiceCall[], now = Date.now()): ListSection<VoiceCall>[] {
  const sorted = [...list].sort(newestFirst((c) => c.endedAt))
  return split(sorted, (c) => callCallFirst(c, now), (c) => istDay(ms(c.endedAt) || 0) === istDay(now), [
    "Call First",
    "Today",
    "Earlier",
  ])
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
