// The Home tab's numbers, as pure functions over the collections the phone
// already holds.
//
// NOT a mirror of a console file. The console's Dashboard (Admin
// lib/analytics/dashboard.js) is built around invoices and payments, which the
// phone deliberately never loads, so a line-for-line port would be a page of
// empty tiles. What IS shared is the vocabulary, and it is kept identical on
// purpose so a number on the phone and a number on the console never disagree
// about what a word means:
//   · "won" is a quotation that is accepted or invoiced;
//   · "win rate" is won over DECIDED (accepted, invoiced, rejected, expired);
//   · a period-scoped quotation is dated by `issueDate`, falling back to
//     `createdAt`, exactly as computeGrowthAnalytics scopes its funnel;
//   · a voice lead is a folded CALL (voiceCallsFrom), never a raw capture row,
//     so a three-capture conversation counts once.
//
// Everything takes `now`, so a test is not a race with the clock.
//
// A field rep opens this between visits, so the order of work is: what needs me
// today, how is the period going against the last one, and only then where it
// is coming from. The screen follows that order; so does this file.

import { round2 } from "@/domain/format"
import type { Enquiry, Quotation } from "@/domain/schema"
import { VOICE_SOURCE, voiceCallsFrom, type VoiceCall } from "@/domain/voice"

export const DAY = 86400000
const HOUR = 3600000

// ---- ranges -----------------------------------------------------------------

export type RangeKey = "7d" | "30d" | "90d"

/**
 * Rolling windows, not month-to-date: on the 2nd of the month an MTD page is two
 * days of data compared with a whole month, and reads as a collapse. Each range
 * also fixes how the trend chart is bucketed, so a column is always wide enough
 * to tap on a 360dp phone (7, 10 or 13 columns).
 */
export const RANGES: { key: RangeKey; label: string; days: number; bucketDays: number; noun: string }[] = [
  { key: "7d", label: "7 days", days: 7, bucketDays: 1, noun: "last week" },
  { key: "30d", label: "30 days", days: 30, bucketDays: 3, noun: "previous 30 days" },
  { key: "90d", label: "90 days", days: 90, bucketDays: 7, noun: "previous 90 days" },
]

export const rangeFor = (key: RangeKey) => RANGES.find((r) => r.key === key) || RANGES[1]

// ---- small helpers ----------------------------------------------------------

const ms = (ts: unknown): number => {
  const t = new Date(ts as string).getTime()
  return Number.isNaN(t) ? NaN : t
}
const within = (ts: unknown, from: number, to: number) => {
  const t = ms(ts)
  return t >= from && t < to
}
const quoteDate = (q: Quotation) => q.issueDate || q.createdAt
const value = (q: Quotation) => Number(q.totals?.grandTotal) || 0
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0))

export const WON = new Set(["accepted", "invoiced"])
export const DECIDED = new Set(["accepted", "invoiced", "rejected", "expired"])
export const OPEN = new Set(["draft", "sent"])

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2)
}

/**
 * Change against the previous period. `pct` is null when there is nothing to
 * compare with, "+∞%" against a zero is not information, and the screen says
 * "new" instead.
 */
export type Delta = { pct: number | null; diff: number; dir: "up" | "down" | "flat" }

export function delta(current: number, previous: number): Delta {
  const diff = round2(current - previous)
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat"
  if (!previous) return { pct: null, diff, dir }
  return { pct: Math.round((diff / Math.abs(previous)) * 100), diff, dir }
}

/** A customer's identity for grouping: company first, as a B2B buyer is the firm. */
const partyName = (c?: { company?: string; name?: string } | null) =>
  (c?.company || "").trim() || (c?.name || "").trim() || "Unnamed customer"

// ---- leads ------------------------------------------------------------------

/** One inbound lead, whichever door it came in through. */
export type Lead = {
  id: string
  kind: "web" | "voice"
  at: number
  source: string
  status: string
  name: string
  /** Every enquiries row behind it, so a quotation linked to any capture counts. */
  rowIds: string[]
}

export const VOICE_LABEL = "Anu voice calls"

export function leadsFrom(enquiries: Enquiry[] = []): Lead[] {
  const web: Lead[] = enquiries
    .filter((e) => e.source !== VOICE_SOURCE)
    .map((e) => ({
      id: e.id,
      kind: "web" as const,
      at: ms(e.createdAt),
      source: e.source || "Other",
      status: e.status || "new",
      name: partyName(e.customer),
      rowIds: [e.id],
    }))
  const voice: Lead[] = voiceCallsFrom(enquiries).map((c: VoiceCall) => ({
    id: c.id,
    kind: "voice" as const,
    // A call is dated by when it began: that is when the customer rang.
    at: ms(c.startedAt || c.endedAt),
    source: VOICE_LABEL,
    status: c.status || "new",
    name: c.named ? c.name : c.customer.company || c.name,
    rowIds: c.rows.map((r) => r.id),
  }))
  return [...web, ...voice].filter((l) => !Number.isNaN(l.at))
}

// ---- needs attention --------------------------------------------------------

export type AttentionItem = {
  id: string
  /** Lower sorts first. */
  priority: number
  tone: "rose" | "amber" | "primary"
  icon: "voice" | "enquiry" | "quote" | "clock"
  title: string
  detail: string
  amount?: number
  /** The number to ring straight from the row, or "" when the lead gave none. */
  phone: string
  target: { screen: "EnquiryDetail" | "VoiceCallDetail" | "QuotationDetail"; id: string }
}

const CLOSED_LEAD = new Set(["won", "lost", "quoted"])

/**
 * What needs a person today, across all time rather than the selected range -
 * a lead that has waited three days does not stop waiting because someone
 * picked "7 days". Mirrors the console Dashboard's "Needs attention" rail, with
 * invoices swapped for the signals a field rep can actually act on from here.
 */
export function attentionItems(
  { enquiries = [], quotations = [], now = Date.now() }: { enquiries?: Enquiry[]; quotations?: Quotation[]; now?: number },
  access: { enquiries: boolean; voice: boolean; quotations: boolean } = { enquiries: true, voice: true, quotations: true },
): AttentionItem[] {
  const out: AttentionItem[] = []

  if (access.voice) {
    for (const call of voiceCallsFrom(enquiries)) {
      if (CLOSED_LEAD.has(call.status)) continue
      const age = now - ms(call.endedAt)
      if (!(age >= 0 && age <= 14 * DAY)) continue
      if (call.flags.support) {
        out.push({
          id: `support-${call.id}`,
          priority: 0,
          tone: "rose",
          icon: "voice",
          title: call.name,
          detail: `Support or complaint on a call ${ageWords(age)}`,
          phone: call.customer.phone || "",
          target: { screen: "VoiceCallDetail", id: call.id },
        })
      } else if (call.status === "new") {
        out.push({
          id: `call-${call.id}`,
          priority: call.flags.urgent ? 1 : age > DAY ? 2 : 3,
          tone: call.flags.urgent || age > DAY ? "amber" : "primary",
          icon: "voice",
          title: call.name,
          detail: call.flags.urgent
            ? `Urgent request, called ${ageWords(age)}`
            : `Called Anu ${ageWords(age)}, not yet contacted`,
          phone: call.customer.phone || "",
          target: { screen: "VoiceCallDetail", id: call.id },
        })
      }
    }
  }

  if (access.enquiries) {
    for (const e of enquiries) {
      if (e.source === VOICE_SOURCE || (e.status || "new") !== "new") continue
      const age = now - ms(e.createdAt)
      if (!(age >= 0 && age <= 30 * DAY)) continue
      out.push({
        id: `enq-${e.id}`,
        priority: age > 2 * DAY ? 1 : age > DAY ? 2 : 3,
        tone: age > DAY ? "amber" : "primary",
        icon: "enquiry",
        title: partyName(e.customer),
        detail: age > DAY ? `Waiting ${ageWords(age, true)} for a first reply` : `New enquiry ${ageWords(age)}`,
        phone: e.customer?.phone || "",
        target: { screen: "EnquiryDetail", id: e.id },
      })
    }
  }

  if (access.quotations) {
    for (const q of quotations) {
      if (q.status !== "sent") continue
      const left = q.validUntil ? Math.ceil((ms(q.validUntil) - now) / DAY) : NaN
      const sentAgo = now - ms(quoteDate(q))
      if (!Number.isNaN(left) && left >= 0 && left <= 3) {
        out.push({
          id: `exp-${q.id}`,
          priority: 1,
          tone: "amber",
          icon: "clock",
          title: partyName(q.customer),
          detail: `${q.number} expires ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`,
          amount: value(q),
          phone: q.customer?.phone || "",
          target: { screen: "QuotationDetail", id: q.id },
        })
      } else if ((Number.isNaN(left) || left > 3) && sentAgo >= 7 * DAY && sentAgo <= 45 * DAY) {
        out.push({
          id: `chase-${q.id}`,
          priority: 2,
          tone: "primary",
          icon: "quote",
          title: partyName(q.customer),
          detail: `${q.number} sent ${Math.floor(sentAgo / DAY)} days ago, no decision yet`,
          amount: value(q),
          phone: q.customer?.phone || "",
          target: { screen: "QuotationDetail", id: q.id },
        })
      }
    }
  }

  return out.sort((a, b) => a.priority - b.priority || (b.amount || 0) - (a.amount || 0))
}

function ageWords(age: number, bare = false): string {
  if (age < HOUR) return bare ? "under an hour" : "just now"
  if (age < DAY) {
    const h = Math.floor(age / HOUR)
    return bare ? `${h} hour${h === 1 ? "" : "s"}` : `${h}h ago`
  }
  const d = Math.floor(age / DAY)
  if (bare) return `${d} day${d === 1 ? "" : "s"}`
  return d === 1 ? "yesterday" : `${d} days ago`
}

// ---- the period dashboard ---------------------------------------------------

export type TrendBucket = { from: number; to: number; label: string; web: number; voice: number; quoted: number }
export type Share = { label: string; count: number; value: number }

export type Dashboard = {
  range: RangeKey
  from: number
  to: number
  leads: { total: number; web: number; voice: number; prev: number; delta: Delta }
  quoted: { count: number; value: number; prevValue: number; delta: Delta }
  won: { count: number; value: number; prevValue: number; delta: Delta }
  winRate: { pct: number | null; prevPct: number | null; decided: number; won: number }
  avgQuote: { value: number; prev: number; delta: Delta }
  /** Median hours from a lead arriving to its first quotation. */
  timeToQuote: { hours: number | null; prevHours: number | null; samples: number }
  /** Leads in the window still marked new. */
  uncontacted: number
  trend: TrendBucket[]
  /**
   * Quoted value as a RUNNING TOTAL, one point per day, for this window and the
   * one before it laid over the same day index. A pacing chart: at any day the
   * reader sees whether this period is ahead of or behind the last at the same
   * point, which a per-bucket column cannot show.
   */
  pace: { current: number[]; previous: number[]; labels: string[] }
  /** When leads arrive: weekday × time of day, over the last 90 days whatever the range. */
  heatmap: Heatmap
  funnel: { stage: string; count: number }[]
  statusMix: (Share & { id: string })[]
  aging: { key: string; label: string; count: number; value: number; tone: "emerald" | "amber" | "rose" }[]
  openValue: number
  sources: { label: string; count: number; won: number; conv: number | null }[]
  topProducts: { name: string; value: number; quantity: number; quotes: number }[]
  topCustomers: { name: string; value: number; quotes: number; wonValue: number }[]
  lostReasons: { reason: string; count: number }[]
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const dayLabel = (t: number) => {
  const d = new Date(t)
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

/** Local midnight at the END of today, so the last bucket always contains now. */
function endOfToday(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime() + DAY
}

export function computeDashboard({
  enquiries = [],
  quotations = [],
  range = "30d",
  now = Date.now(),
}: {
  enquiries?: Enquiry[]
  quotations?: Quotation[]
  range?: RangeKey
  now?: number
}): Dashboard {
  const r = rangeFor(range)
  // Whole days, aligned to local midnight, so "7 days" is today plus the six
  // before it and every bucket in the chart is a calendar day (or run of days).
  const to = endOfToday(now)
  const from = to - r.days * DAY
  const prevFrom = from - r.days * DAY

  const leads = leadsFrom(enquiries)
  const inWindow = leads.filter((l) => l.at >= from && l.at < to)
  const inPrev = leads.filter((l) => l.at >= prevFrom && l.at < from)

  // A draft is not a quotation anyone has seen, so it is not "quoted".
  const issued = quotations.filter((q) => q.status !== "draft")
  const qNow = issued.filter((q) => within(quoteDate(q), from, to))
  const qPrev = issued.filter((q) => within(quoteDate(q), prevFrom, from))
  const wonNow = qNow.filter((q) => WON.has(q.status))
  const wonPrev = qPrev.filter((q) => WON.has(q.status))

  const rate = (list: Quotation[]) => {
    const decided = list.filter((q) => DECIDED.has(q.status))
    const won = decided.filter((q) => WON.has(q.status))
    return { pct: decided.length ? Math.round((won.length / decided.length) * 100) : null, decided: decided.length, won: won.length }
  }
  const rNow = rate(qNow)
  const rPrev = rate(qPrev)

  const quotedValue = sum(qNow.map(value))
  const prevQuotedValue = sum(qPrev.map(value))
  const wonValue = sum(wonNow.map(value))
  const prevWonValue = sum(wonPrev.map(value))
  const avg = qNow.length ? round2(quotedValue / qNow.length) : 0
  const prevAvg = qPrev.length ? round2(prevQuotedValue / qPrev.length) : 0

  // ---- time to quote: lead -> its FIRST linked quotation (drafts count: the
  // work of pricing it is done the moment one exists).
  const firstQuoteAt = new Map<string, number>()
  for (const q of quotations) {
    if (!q.enquiryId) continue
    const t = ms(q.createdAt || q.issueDate)
    if (Number.isNaN(t)) continue
    const seen = firstQuoteAt.get(q.enquiryId)
    if (seen === undefined || t < seen) firstQuoteAt.set(q.enquiryId, t)
  }
  const hoursToQuote = (list: Lead[]) =>
    list
      .map((l) => {
        const times = l.rowIds.map((id) => firstQuoteAt.get(id)).filter((t): t is number => t !== undefined)
        if (!times.length) return null
        return Math.max(0, (Math.min(...times) - l.at) / HOUR)
      })
      .filter((h): h is number => h !== null)
  const ttqNow = hoursToQuote(inWindow)
  const ttqPrev = hoursToQuote(inPrev)

  // ---- trend
  const bucketMs = r.bucketDays * DAY
  const trend: TrendBucket[] = []
  for (let start = from; start < to; start += bucketMs) {
    const end = Math.min(to, start + bucketMs)
    const ls = inWindow.filter((l) => l.at >= start && l.at < end)
    trend.push({
      from: start,
      to: end,
      label: r.bucketDays === 1 ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end - DAY)}`,
      web: ls.filter((l) => l.kind === "web").length,
      voice: ls.filter((l) => l.kind === "voice").length,
      quoted: sum(qNow.filter((q) => within(quoteDate(q), start, end)).map(value)),
    })
  }

  // ---- funnel, each stage scoped by its own date (the console Growth funnel's rule)
  const funnel = [
    { stage: "Leads", count: inWindow.length },
    { stage: "Quoted", count: qNow.length },
    { stage: "Won", count: wonNow.length },
  ]

  // ---- status mix, over every quotation dated in the window (drafts included,
  // since a pile of unsent drafts is exactly what this should reveal)
  const allNow = quotations.filter((q) => within(quoteDate(q), from, to))
  const mixMap = new Map<string, { count: number; value: number }>()
  for (const q of allNow) {
    const m = mixMap.get(q.status || "draft") || { count: 0, value: 0 }
    m.count += 1
    m.value = round2(m.value + value(q))
    mixMap.set(q.status || "draft", m)
  }
  const ORDER = ["draft", "sent", "accepted", "invoiced", "rejected", "expired"]
  const statusMix = ORDER.filter((id) => mixMap.has(id)).map((id) => ({ id, label: id, ...mixMap.get(id)! }))

  // ---- open quotes by age, all time (a quote to chase is not period-scoped)
  const aging: Dashboard["aging"] = [
    { key: "0-7", label: "0–7 days", count: 0, value: 0, tone: "emerald" },
    { key: "8-15", label: "8–15 days", count: 0, value: 0, tone: "amber" },
    { key: "16-30", label: "16–30 days", count: 0, value: 0, tone: "amber" },
    { key: "30+", label: "30+ days", count: 0, value: 0, tone: "rose" },
  ]
  let openValue = 0
  for (const q of quotations) {
    if (!OPEN.has(q.status)) continue
    const age = Math.floor((now - ms(quoteDate(q))) / DAY)
    if (Number.isNaN(age)) continue
    const b = age <= 7 ? aging[0] : age <= 15 ? aging[1] : age <= 30 ? aging[2] : aging[3]
    b.count += 1
    b.value = round2(b.value + value(q))
    openValue = round2(openValue + value(q))
  }

  // ---- lead sources, with how many of each became a win
  const wonLeadIds = new Set<string>()
  for (const q of quotations) if (q.enquiryId && WON.has(q.status)) wonLeadIds.add(q.enquiryId)
  const srcMap = new Map<string, { count: number; won: number }>()
  for (const l of inWindow) {
    const s = srcMap.get(l.source) || { count: 0, won: 0 }
    s.count += 1
    if (l.status === "won" || l.rowIds.some((id) => wonLeadIds.has(id))) s.won += 1
    srcMap.set(l.source, s)
  }
  const sources = [...srcMap.entries()]
    .map(([label, s]) => ({ label, ...s, conv: s.count ? Math.round((s.won / s.count) * 100) : null }))
    .sort((a, b) => b.count - a.count)

  // ---- what is being quoted, by value
  // Taxable line value (ex-GST), so a product is not ranked up by its tax rate.
  const prodMap = new Map<string, { name: string; value: number; quantity: number; quotes: Set<string> }>()
  for (const q of qNow) {
    ;(q.lines || []).forEach((line, i) => {
      const name = String(line.description || "").split("\n")[0].trim() || "Unnamed item"
      const key = line.productId || name.toLowerCase()
      const lineValue =
        Number(q.totals?.lines?.[i]?.taxable) || (Number(line.quantity) || 0) * (Number(line.rate) || 0)
      const p = prodMap.get(key) || { name, value: 0, quantity: 0, quotes: new Set<string>() }
      p.value = round2(p.value + lineValue)
      p.quantity += Number(line.quantity) || 0
      p.quotes.add(q.id)
      prodMap.set(key, p)
    })
  }
  const topProducts = [...prodMap.values()]
    .map((p) => ({ name: p.name, value: p.value, quantity: p.quantity, quotes: p.quotes.size }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // ---- who is being quoted
  const custMap = new Map<string, { name: string; value: number; quotes: number; wonValue: number }>()
  for (const q of qNow) {
    const name = partyName(q.customer)
    const key = name.toLowerCase()
    const c = custMap.get(key) || { name, value: 0, quotes: 0, wonValue: 0 }
    c.value = round2(c.value + value(q))
    c.quotes += 1
    if (WON.has(q.status)) c.wonValue = round2(c.wonValue + value(q))
    custMap.set(key, c)
  }
  const topCustomers = [...custMap.values()].sort((a, b) => b.value - a.value).slice(0, 5)

  // ---- why we lose
  const lostMap = new Map<string, number>()
  for (const q of qNow) {
    if (q.status !== "rejected") continue
    const reason = q.lostReason || "No reason recorded"
    lostMap.set(reason, (lostMap.get(reason) || 0) + 1)
  }
  const lostReasons = [...lostMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

  // ---- pacing: running quoted total per day, this window vs the last
  const runningTotal = (list: Quotation[], start: number) => {
    const daily = new Array(r.days).fill(0)
    for (const q of list) {
      const i = Math.floor((ms(quoteDate(q)) - start) / DAY)
      if (i >= 0 && i < r.days) daily[i] += value(q)
    }
    let run = 0
    return daily.map((v) => (run = round2(run + v)))
  }
  const pace = {
    current: runningTotal(qNow, from),
    previous: runningTotal(qPrev, prevFrom),
    labels: Array.from({ length: r.days }, (_, i) => dayLabel(from + i * DAY)),
  }

  return {
    range,
    from,
    to,
    leads: {
      total: inWindow.length,
      web: inWindow.filter((l) => l.kind === "web").length,
      voice: inWindow.filter((l) => l.kind === "voice").length,
      prev: inPrev.length,
      delta: delta(inWindow.length, inPrev.length),
    },
    quoted: { count: qNow.length, value: quotedValue, prevValue: prevQuotedValue, delta: delta(quotedValue, prevQuotedValue) },
    won: { count: wonNow.length, value: wonValue, prevValue: prevWonValue, delta: delta(wonValue, prevWonValue) },
    winRate: { pct: rNow.pct, prevPct: rPrev.pct, decided: rNow.decided, won: rNow.won },
    avgQuote: { value: avg, prev: prevAvg, delta: delta(avg, prevAvg) },
    timeToQuote: { hours: median(ttqNow), prevHours: median(ttqPrev), samples: ttqNow.length },
    uncontacted: inWindow.filter((l) => l.status === "new").length,
    trend,
    pace,
    heatmap: leadHeatmap(leads, now),
    funnel,
    statusMix,
    aging,
    openValue,
    sources,
    topProducts,
    topCustomers,
    lostReasons,
  }
}

// ---- when leads arrive --------------------------------------------------------

export type Heatmap = {
  /** Row labels, Monday first: a working week reads left to right from there. */
  days: string[]
  /** Column labels, the phone-answering day in four bands plus "night". */
  bands: string[]
  /** cells[day][band] */
  cells: number[][]
  max: number
  total: number
  /** The busiest cell in words, or null with no leads. */
  peak: { day: string; band: string; count: number } | null
}

const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
/** [label, first hour inclusive, last hour exclusive]; night wraps midnight. */
const HEAT_BANDS: [string, number, number][] = [
  ["9–12", 9, 12],
  ["12–3", 12, 15],
  ["3–6", 15, 18],
  ["6–9", 18, 21],
  ["Night", 21, 33],
]

/**
 * Leads by weekday and time of day, in LOCAL time (the rep's), over a fixed
 * 90 days so the pattern has enough leads to be a pattern at every range. The
 * question it answers is operational: when does someone have to be free to pick
 * up the phone.
 */
export function leadHeatmap(leads: Lead[], now = Date.now(), days = 90): Heatmap {
  const since = now - days * DAY
  const cells = HEAT_DAYS.map(() => HEAT_BANDS.map(() => 0))
  for (const l of leads) {
    if (l.at < since || l.at > now) continue
    const d = new Date(l.at)
    const h = d.getHours()
    // Hours before 9am fall in "Night" (21:00–09:00) but stay on their own
    // calendar day: a 7am lead is that morning's first call, not last night's.
    const band = HEAT_BANDS.findIndex(([, a, b]) => (h >= a && h < b) || (h + 24 >= a && h + 24 < b))
    const day = (d.getDay() + 6) % 7
    cells[day][band === -1 ? HEAT_BANDS.length - 1 : band] += 1
  }
  let max = 0
  let total = 0
  let peak: Heatmap["peak"] = null
  cells.forEach((row, di) =>
    row.forEach((n, bi) => {
      total += n
      if (n > max) {
        max = n
        peak = { day: HEAT_DAYS[di], band: HEAT_BANDS[bi][0], count: n }
      }
    }),
  )
  return { days: HEAT_DAYS, bands: HEAT_BANDS.map((b) => b[0]), cells, max, total, peak }
}

/** Where a time-to-quote sits on the speed scale Home draws: < 1h, < 4h, < 1 day, slower. */
export const SPEED_STEPS = [
  { label: "1h", hours: 1 },
  { label: "4h", hours: 4 },
  { label: "1 day", hours: 24 },
  { label: "Slower", hours: Infinity },
]
export function speedStep(hours: number | null): number {
  if (hours === null) return -1
  return SPEED_STEPS.findIndex((s) => hours < s.hours)
}

/** "3.5 h", "2 days", a duration a person reads, not a decimal. */
export function durationWords(hours: number | null): string {
  if (hours === null) return "–"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${round2(Math.round(hours * 10) / 10)} h`
  const d = Math.round(hours / 24)
  return `${d} days`
}

// ---- website traffic --------------------------------------------------------

/**
 * One `user_activities` row, narrowed server-side to the fields this reads
 * (see features/home/useWebTraffic.ts). Written by Ortex.Web's lib/tracker.js.
 */
export type WebActivity = {
  at: string
  userId?: string | null
  sessionId?: string | null
  activityType?: string | null
  referrer?: string | null
  device?: string | null
  city?: string | null
  page?: string | null
  pageUrl?: string | null
  productName?: string | null
  searchQuery?: string | null
}

/** Coarse acquisition channel from a referrer. Same buckets as the console's growth.js. */
export function channelOf(ref?: string | null): string {
  if (!ref || ref === "Direct") return "Direct"
  const m = /^https?:\/\/([^/?#]+)/i.exec(ref)
  if (!m) return "Referral"
  const host = m[1].replace(/^www\./, "").toLowerCase()
  if (/google|bing|duckduckgo|yahoo|ecosia/.test(host)) return "Organic search"
  // Marketplaces before social, and t.co as a whole host: an unanchored `t\.co`
  // matches "indiamart.com", which filed every IndiaMART visit under Social.
  if (/indiamart|justdial|tradeindia|amazon|flipkart/.test(host)) return "Marketplace"
  if (/facebook|instagram|linkedin|twitter|youtube|whatsapp/.test(host) || host === "t.co") return "Social"
  if (/ortex/.test(host)) return "Direct"
  return host
}

// Values the tracker writes when it knows nothing about a place.
const NO_CITY = new Set(["", "not collected", "unknown city", "unknown"])

export type WebTraffic = {
  visitors: number
  prevVisitors: number
  visitorsDelta: Delta
  sessions: number
  prevSessions: number
  sessionsDelta: Delta
  pageViews: number
  /** Sessions that opened the quote builder, intent, the step before a lead. */
  quoteSessions: number
  /** Share of sessions from a phone, 0–100. */
  mobileShare: number | null
  trend: { label: string; sessions: number }[]
  /** Sessions per bucket in the previous window, on the same bucket grid as `trend`. */
  trendPrevious: number[]
  topPages: { label: string; count: number }[]
  topSearches: { label: string; count: number }[]
  /** Searched for, and nothing in the catalogue matches, what to add next. */
  demandGaps: { label: string; count: number }[]
  cities: { label: string; count: number }[]
  channels: { label: string; count: number }[]
}

const tally = (xs: string[], limit = 5) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1)
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function computeWebTraffic({
  activities = [],
  products = [],
  range = "30d",
  now = Date.now(),
}: {
  activities?: WebActivity[]
  products?: { name?: string; material?: string; category?: string }[]
  range?: RangeKey
  now?: number
}): WebTraffic {
  const r = rangeFor(range)
  const to = endOfToday(now)
  const from = to - r.days * DAY
  const prevFrom = from - r.days * DAY

  const cur = activities.filter((a) => within(a.at, from, to))
  const prev = activities.filter((a) => within(a.at, prevFrom, from))

  const uniq = (xs: (string | null | undefined)[]) => new Set(xs.filter(Boolean) as string[]).size
  const visitors = uniq(cur.map((a) => a.userId))
  const prevVisitors = uniq(prev.map((a) => a.userId))
  const sessions = uniq(cur.map((a) => a.sessionId))
  const prevSessions = uniq(prev.map((a) => a.sessionId))

  // Per session: its first row's channel and device, and whether it quoted.
  const bySession = new Map<string, { channel: string; device: string; quote: boolean; city: string }>()
  for (const a of [...cur].sort((x, y) => ms(x.at) - ms(y.at))) {
    if (!a.sessionId) continue
    const s = bySession.get(a.sessionId) || {
      channel: channelOf(a.referrer),
      device: a.device || "Unknown",
      quote: false,
      city: (a.city || "").trim(),
    }
    if (a.page === "Quote builder" || (a.pageUrl || "").startsWith("/quote")) s.quote = true
    if (!s.city && a.city) s.city = a.city.trim()
    bySession.set(a.sessionId, s)
  }
  const sessionRows = [...bySession.values()]
  const mobile = sessionRows.filter((s) => /mobile|tablet/i.test(s.device)).length

  const views = cur.filter((a) => !/search/i.test(a.activityType || ""))
  const topPages = tally(views.map((a) => a.productName || a.page || a.pageUrl || "Unknown page"))

  const searches = cur
    .map((a) => (a.searchQuery || "").trim().toLowerCase())
    .filter(Boolean)
  const topSearches = tally(searches)
  const hay = products.map((p) => `${p.name || ""} ${p.material || ""} ${p.category || ""}`.toLowerCase())
  const demandGaps = tally(searches.filter((q) => !hay.some((h) => h.includes(q))))

  const cities = tally(sessionRows.map((s) => s.city).filter((c) => !NO_CITY.has(c.toLowerCase())))
  const channels = tally(sessionRows.map((s) => s.channel))

  const bucketMs = r.bucketDays * DAY
  const trend: WebTraffic["trend"] = []
  const trendPrevious: number[] = []
  for (let start = from; start < to; start += bucketMs) {
    const end = Math.min(to, start + bucketMs)
    trend.push({
      label: r.bucketDays === 1 ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end - DAY)}`,
      sessions: uniq(cur.filter((a) => within(a.at, start, end)).map((a) => a.sessionId)),
    })
    const shift = r.days * DAY
    trendPrevious.push(uniq(prev.filter((a) => within(a.at, start - shift, end - shift)).map((a) => a.sessionId)))
  }

  return {
    visitors,
    prevVisitors,
    visitorsDelta: delta(visitors, prevVisitors),
    sessions,
    prevSessions,
    sessionsDelta: delta(sessions, prevSessions),
    pageViews: views.length,
    quoteSessions: sessionRows.filter((s) => s.quote).length,
    mobileShare: sessionRows.length ? Math.round((mobile / sessionRows.length) * 100) : null,
    trend,
    trendPrevious,
    topPages,
    topSearches,
    demandGaps,
    cities,
    channels,
  }
}
