// Insights → Sales: the analysis the phone's Insights page carries, as pure
// functions over the collections the console already holds. The maths follows
// Ortex.Mobile/src/domain/dashboard.ts (computeDashboard + leadHeatmap) so a
// number read on the phone and on the console is the same number.
//
// Vocabulary, identical on every screen:
//   · won      = quotation accepted or invoiced
//   · win rate = won / decided (accepted, invoiced, rejected, expired)
//   · a quotation is dated by issueDate, falling back to createdAt
//   · a voice lead is a folded CALL (voiceCalls), never a raw capture row
//
// Windows are whole local days ending with today (7 / 30 / 90), compared with
// the window of the same length before them. Everything takes `now`, so a test
// is not a race with the clock. Nothing here reads invoices or payments: the
// page gates those cards separately, so a person without invoice access still
// gets every figure below.

import { round2 } from "../format"
import { VOICE_SOURCE } from "../../pages/voice-leads/helpers"
import { DAY, DECIDED, OPEN_QUOTE, WON, delta, partyName, rangeFor, voiceCalls } from "./today"

const HOUR = 3600000

const ms = (ts) => {
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? NaN : t
}
const within = (ts, from, to) => {
  const t = ms(ts)
  return t >= from && t < to
}
const quoteDate = (q) => q.issueDate || q.createdAt
const value = (q) => Number(q?.totals?.grandTotal) || 0
const sum = (xs) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))

export const VOICE_LABEL = "Anu voice calls"

export function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2)
}

/** Local midnight at the END of today, so the window always contains now. */
function endOfToday(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime() + DAY
}

// ---- leads ----------------------------------------------------------------------

/**
 * One inbound lead, whichever door it came in through: a web enquiry row, or an
 * Anu call folded from its capture rows. `rowIds` keeps every row behind a call,
 * so a quotation linked to any capture counts for the call.
 */
export function leadsFrom(enquiries = []) {
  const web = enquiries
    .filter((e) => e.source !== VOICE_SOURCE)
    .map((e) => ({
      id: e.id,
      kind: "web",
      at: ms(e.createdAt),
      source: e.source || "Other",
      status: e.status || "new",
      name: partyName(e.customer),
      rowIds: [e.id],
    }))
  const voice = voiceCalls(enquiries).map((c) => ({
    id: c.id,
    kind: "voice",
    // A call is dated by when it began: that is when the customer rang.
    at: ms(c.startedAt || c.endedAt),
    source: VOICE_LABEL,
    status: c.status || "new",
    name: c.named ? c.name : c.customer.company || c.name,
    rowIds: c.rows.map((r) => r.id),
  }))
  return [...web, ...voice].filter((l) => !Number.isNaN(l.at))
}

// ---- the period -----------------------------------------------------------------

export const STATUS_ORDER = ["draft", "sent", "accepted", "invoiced", "rejected", "expired"]

export function computeSales({ enquiries = [], quotations = [] }, range = "30d", now = Date.now()) {
  const r = rangeFor(range)
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

  const rate = (list) => {
    const decided = list.filter((q) => DECIDED.has(q.status))
    const won = decided.filter((q) => WON.has(q.status))
    return { pct: decided.length ? Math.round((won.length / decided.length) * 100) : null, decided: decided.length, won: won.length }
  }
  const rNow = rate(qNow)
  const rPrev = rate(qPrev)

  const quotedValue = sum(qNow.map(value))
  const prevQuotedValue = sum(qPrev.map(value))
  const avg = qNow.length ? round2(quotedValue / qNow.length) : 0
  const prevAvg = qPrev.length ? round2(prevQuotedValue / qPrev.length) : 0

  // ---- time to quote: lead -> its FIRST linked quotation. Drafts count: the
  // work of pricing it is done the moment one exists.
  const firstQuoteAt = new Map()
  for (const q of quotations) {
    if (!q.enquiryId) continue
    const t = ms(q.createdAt || q.issueDate)
    if (Number.isNaN(t)) continue
    const seen = firstQuoteAt.get(q.enquiryId)
    if (seen === undefined || t < seen) firstQuoteAt.set(q.enquiryId, t)
  }
  const hoursToQuote = (list) =>
    list
      .map((l) => {
        const times = l.rowIds.map((id) => firstQuoteAt.get(id)).filter((t) => t !== undefined)
        if (!times.length) return null
        return Math.max(0, (Math.min(...times) - l.at) / HOUR)
      })
      .filter((h) => h !== null)
  const ttqNow = hoursToQuote(inWindow)
  const ttqPrev = hoursToQuote(inPrev)

  // ---- status mix over every quotation dated in the window, drafts included,
  // since a pile of unsent drafts is exactly what this should reveal.
  const mix = new Map()
  for (const q of quotations) {
    if (!within(quoteDate(q), from, to)) continue
    const id = q.status || "draft"
    const m = mix.get(id) || { count: 0, value: 0 }
    m.count += 1
    m.value = round2(m.value + value(q))
    mix.set(id, m)
  }
  const statusMix = STATUS_ORDER.filter((id) => mix.has(id)).map((id) => ({ id, ...mix.get(id) }))

  // ---- lead sources, with how many of each became a win (the lead's own status,
  // or a won quotation linked to any row behind it).
  const wonLeadIds = new Set()
  for (const q of quotations) if (q.enquiryId && WON.has(q.status)) wonLeadIds.add(q.enquiryId)
  const srcMap = new Map()
  for (const l of inWindow) {
    const s = srcMap.get(l.source) || { count: 0, won: 0 }
    s.count += 1
    if (l.status === "won" || l.rowIds.some((id) => wonLeadIds.has(id))) s.won += 1
    srcMap.set(l.source, s)
  }
  const sources = [...srcMap.entries()]
    .map(([label, s]) => ({ label, ...s, conv: s.count ? Math.round((s.won / s.count) * 100) : null }))
    .sort((a, b) => b.count - a.count)

  // ---- what is being quoted, by taxable line value (ex-GST), so a product is
  // not ranked up by its tax rate.
  const prodMap = new Map()
  for (const q of qNow) {
    ;(q.lines || []).forEach((line, i) => {
      const name = String(line.description || "").split("\n")[0].trim() || "Unnamed item"
      const key = line.productId || name.toLowerCase()
      const lineValue = Number(q.totals?.lines?.[i]?.taxable) || (Number(line.quantity) || 0) * (Number(line.rate) || 0)
      const p = prodMap.get(key) || { name, value: 0, quantity: 0, quotes: new Set() }
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

  // ---- who is being quoted, with the won part.
  const custMap = new Map()
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
  const lostMap = new Map()
  for (const q of qNow) {
    if (q.status !== "rejected") continue
    const reason = (q.lostReason || "").trim() || "No reason recorded"
    lostMap.set(reason, (lostMap.get(reason) || 0) + 1)
  }
  const lostReasons = [...lostMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

  let openValue = 0
  for (const q of quotations) if (OPEN_QUOTE.has(q.status)) openValue = round2(openValue + value(q))

  return {
    range: r.value,
    days: r.days,
    noun: r.noun,
    from,
    to,
    leads: { total: inWindow.length, prev: inPrev.length, delta: delta(inWindow.length, inPrev.length) },
    quoted: { count: qNow.length, value: quotedValue, prevValue: prevQuotedValue, delta: delta(quotedValue, prevQuotedValue) },
    winRate: { pct: rNow.pct, prevPct: rPrev.pct, decided: rNow.decided, won: rNow.won },
    avgQuote: { value: avg, prev: prevAvg, delta: delta(avg, prevAvg) },
    timeToQuote: { hours: median(ttqNow), prevHours: median(ttqPrev), samples: ttqNow.length },
    uncontacted: inWindow.filter((l) => l.status === "new").length,
    statusMix,
    openValue,
    sources,
    topProducts,
    topCustomers,
    lostReasons,
    heatmap: leadHeatmap(leads, now),
  }
}

// ---- when leads arrive --------------------------------------------------------

export const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
/** [label, first hour inclusive, last hour exclusive]; night wraps midnight. */
const HEAT_BANDS = [
  ["9–12", 9, 12],
  ["12–3", 12, 15],
  ["3–6", 15, 18],
  ["6–9", 18, 21],
  ["Night", 21, 33],
]

/**
 * Leads by weekday and time of day, in LOCAL time, over a fixed 90 days so the
 * pattern has enough leads to be a pattern at every range. It answers when
 * someone has to be free to pick up the phone.
 */
export function leadHeatmap(leads, now = Date.now(), days = 90) {
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
  let peak = null
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

// ---- words ----------------------------------------------------------------------

/** "3.5 h", "2 days": a duration a person reads, not a decimal. */
export function durationWords(hours) {
  if (hours === null || hours === undefined) return "–"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${round2(Math.round(hours * 10) / 10)} h`
  return `${Math.round(hours / 24)} days`
}

/** The time-to-quote comparison as a sentence. Faster is better, so "down" is good. */
export function speedWords(hours, prevHours, noun) {
  if (hours === null || hours === undefined) return "No lead in this period has a linked quotation yet."
  if (prevHours === null || prevHours === undefined) return `Nothing to compare with in ${noun}.`
  const diff = hours - prevHours
  if (Math.abs(diff) < 0.05 * Math.max(prevHours, 1)) return `About the same as ${noun}.`
  return `${durationWords(Math.abs(diff))} ${diff < 0 ? "faster" : "slower"} than ${noun} (${durationWords(prevHours)}).`
}
