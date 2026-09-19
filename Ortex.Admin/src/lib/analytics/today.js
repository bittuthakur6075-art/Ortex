// The Dashboard's numbers: what needs a person today, and how the chosen window
// is going against the one before it. Pure functions over the raw collections,
// every one taking `now` so a test is not a race with the clock.
//
// Also imported by Ortex.WhatsApp.Bot (plain Node, through its src/loader.js),
// so keep it free of browser-only imports; the bot's npm test fails if not.
//
// Vocabulary is kept identical to computeAnalytics (Insights → Sales) and to the
// phone's domain/dashboard.ts, so a word means the same thing on every screen:
//   · won      = quotation accepted or invoiced
//   · win rate = won / decided (accepted, invoiced, rejected, expired)
//   · revenue  = taxable value of non-cancelled invoices, by issueDate
//   · a voice lead is a folded CALL (groupIntoCalls), never a raw capture row,
//     so a three-capture conversation counts once and is chased once.
//
// Windows are ROLLING (7 / 30 / 90 days), not month-to-date: on the 2nd of the
// month an MTD figure is two days measured against a whole month and reads as a
// collapse, which is the one thing a comparison must never do by accident.

import { round2 } from "../format"
import { invoiceBalance, resolveInvoiceStatus } from "../../data/domain/domain"
import { VOICE_SOURCE, displayName, flagsFor, groupIntoCalls, itemsFor, parseMessage } from "../../pages/voice-leads/helpers"

export const DAY = 86400000
const HOUR = 3600000

export const RANGES = [
  { value: "7d", label: "7 days", days: 7, noun: "the previous 7 days" },
  { value: "30d", label: "30 days", days: 30, noun: "the previous 30 days" },
  { value: "90d", label: "90 days", days: 90, noun: "the previous 90 days" },
]

export const rangeFor = (value) => RANGES.find((r) => r.value === value) || RANGES[1]

// ---- helpers ------------------------------------------------------------------

const ms = (ts) => {
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? NaN : t
}
const within = (ts, from, to) => {
  const t = ms(ts)
  return t >= from && t < to
}
const sum = (xs) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))
const quoteDate = (q) => q.issueDate || q.createdAt
const grand = (doc) => Number(doc?.totals?.grandTotal) || 0

export const WON = new Set(["accepted", "invoiced"])
export const DECIDED = new Set(["accepted", "invoiced", "rejected", "expired"])
export const OPEN_QUOTE = new Set(["draft", "sent"])
const CLOSED_LEAD = new Set(["won", "lost", "quoted"])

export const partyName = (c) => (c?.company || "").trim() || (c?.name || "").trim() || "Unnamed customer"

/**
 * Change against the previous window. `pct` is null when the previous value is
 * zero: "+∞%" is not information, and the page says "new" instead.
 */
export function delta(current, previous) {
  const diff = round2(current - previous)
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat"
  if (!previous) return { pct: null, diff, dir }
  return { pct: Math.round((diff / Math.abs(previous)) * 100), diff, dir }
}

/** Anu's capture rows folded into calls, exactly as the Voice calls tab does. */
export function voiceCalls(enquiries = []) {
  const rows = enquiries
    .filter((e) => e.source === VOICE_SOURCE)
    .map((e) => {
      const parsed = { ...e, ...parseMessage(e.message) }
      return { ...parsed, itemsList: itemsFor(parsed) }
    })
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
  return groupIntoCalls(rows).map((c) => ({ ...c, flags: flagsFor(c), ...displayName(c.customer.name) }))
}

export function ageWords(age) {
  if (age < HOUR) return "just now"
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`
  const d = Math.floor(age / DAY)
  return d === 1 ? "yesterday" : `${d} days ago`
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// ---- needs you today ------------------------------------------------------------

/**
 * Everything waiting on a person, across ALL dates rather than the chosen
 * window: an invoice 40 days late does not stop being late because someone
 * picked "7 days". Lower `priority` sorts first; ties go to the bigger amount.
 *
 * `access` mirrors canAccess per module, so nobody is told about a record RLS
 * would refuse to open.
 *
 * Each item: { id, group: "money" | "leads" | "quotes", priority, tone, kind,
 * title, detail, amount?, phone, to, state? }
 */
export function attentionItems(
  { invoices = [], payments = [], enquiries = [], quotations = [] },
  access = { invoices: true, enquiries: true, voice: true, quotations: true },
  now = Date.now(),
) {
  const out = []

  if (access.invoices) {
    for (const inv of invoices) {
      const status = resolveInvoiceStatus(inv, payments)
      if (["paid", "cancelled", "draft"].includes(status) || !inv.dueDate) continue
      const balance = invoiceBalance(inv, payments)
      if (balance <= 0.5) continue
      const days = Math.floor((now - ms(inv.dueDate)) / DAY)
      if (Number.isNaN(days)) continue
      const base = { group: "money", title: partyName(inv.customer), amount: balance, phone: inv.customer?.phone || "", to: "/billing?tab=invoices", state: { openId: inv.id } }
      if (days > 0) {
        out.push({
          ...base,
          id: `inv-${inv.id}`,
          priority: days > 30 ? 0 : 1,
          tone: "rose",
          kind: "Overdue",
          detail: `${inv.number} · ${plural(days, "day")} late`,
        })
      } else if (days >= -3) {
        const left = -days
        out.push({
          ...base,
          id: `due-${inv.id}`,
          priority: 3,
          tone: "amber",
          kind: "Due soon",
          detail: `${inv.number} · due ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`,
        })
      }
    }
  }

  if (access.voice) {
    for (const call of voiceCalls(enquiries)) {
      if (CLOSED_LEAD.has(call.status)) continue
      const age = now - ms(call.endedAt)
      if (!(age >= 0 && age <= 14 * DAY)) continue
      const base = { group: "leads", title: call.name, phone: call.customer.phone || "", to: "/crm?tab=voice", state: { openId: call.id } }
      if (call.flags.support) {
        out.push({ ...base, id: `support-${call.id}`, priority: 0, tone: "rose", kind: "Complaint", detail: `Support call to Anu ${ageWords(age)}` })
      } else if (call.status === "new") {
        out.push({
          ...base,
          id: `call-${call.id}`,
          priority: call.flags.urgent ? 1 : age > DAY ? 2 : 3,
          tone: call.flags.urgent || age > DAY ? "amber" : "blue",
          kind: call.flags.urgent ? "Urgent call" : "Anu call",
          detail: `${call.productInterest || "Called Anu"} · ${ageWords(age)}, not yet contacted`,
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
        group: "leads",
        priority: age > 2 * DAY ? 1 : age > DAY ? 2 : 3,
        tone: age > DAY ? "amber" : "blue",
        kind: "New enquiry",
        title: partyName(e.customer),
        detail: `${e.productInterest || e.source || "Website"} · ${age > DAY ? `waiting since ${ageWords(age)}` : ageWords(age)}`,
        phone: e.customer?.phone || "",
        to: `/enquiries/${e.id}`,
      })
    }
  }

  if (access.quotations) {
    for (const q of quotations) {
      if (q.status !== "sent") continue
      const left = q.validUntil ? Math.ceil((ms(q.validUntil) - now) / DAY) : NaN
      const sentAgo = now - ms(quoteDate(q))
      const base = { group: "quotes", title: partyName(q.customer), amount: grand(q), phone: q.customer?.phone || "", to: "/quotations", state: { openId: q.id } }
      if (!Number.isNaN(left) && left >= 0 && left <= 3) {
        out.push({ ...base, id: `exp-${q.id}`, priority: 1, tone: "amber", kind: "Expiring", detail: `${q.number} · expires ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}` })
      } else if (!Number.isNaN(left) && left < 0 && left >= -14) {
        out.push({ ...base, id: `lapsed-${q.id}`, priority: 2, tone: "rose", kind: "Lapsed", detail: `${q.number} · expired ${plural(-left, "day")} ago, still marked sent` })
      } else if ((Number.isNaN(left) || left > 3) && sentAgo >= 7 * DAY && sentAgo <= 45 * DAY) {
        out.push({ ...base, id: `chase-${q.id}`, priority: 2, tone: "blue", kind: "Chase", detail: `${q.number} · sent ${Math.floor(sentAgo / DAY)} days ago, no decision` })
      }
    }
  }

  return out.sort((a, b) => a.priority - b.priority || (b.amount || 0) - (a.amount || 0))
}

// ---- the window -----------------------------------------------------------------

/** Running total per day for [from, from + days), one point per day. */
function runningTotal(entries, from, days) {
  const daily = new Array(days).fill(0)
  for (const { at, value } of entries) {
    const i = Math.floor((at - from) / DAY)
    if (i >= 0 && i < days) daily[i] += value
  }
  let acc = 0
  return daily.map((v) => (acc = round2(acc + v)))
}

export function computeToday({ enquiries = [], quotations = [], invoices = [], payments = [] }, range = "30d", now = Date.now()) {
  const { days, noun } = rangeFor(range)
  const to = now
  const from = now - days * DAY
  const prevFrom = from - days * DAY
  const cur = (ts) => within(ts, from, to)
  const prev = (ts) => within(ts, prevFrom, from)

  // ---- cash, with a pacing line against the previous window ----
  const inflows = payments.filter((p) => p.type === "inflow")
  const cashNow = sum(inflows.filter((p) => cur(p.date)).map((p) => p.amount))
  const cashPrev = sum(inflows.filter((p) => prev(p.date)).map((p) => p.amount))
  const entries = inflows.map((p) => ({ at: ms(p.date), value: Number(p.amount) || 0 }))
  const pace = {
    current: runningTotal(entries, from, days),
    previous: runningTotal(entries, prevFrom, days),
    labels: Array.from({ length: days }, (_, i) => new Date(from + i * DAY).toLocaleDateString("en-IN", { day: "numeric", month: "short" })),
  }

  // ---- revenue (taxable) ----
  const live = invoices.filter((i) => i.status !== "cancelled")
  const revNow = sum(live.filter((i) => cur(i.issueDate)).map((i) => i.totals?.taxable))
  const revPrev = sum(live.filter((i) => prev(i.issueDate)).map((i) => i.totals?.taxable))

  // ---- quotations ----
  const qNow = quotations.filter((q) => cur(quoteDate(q)))
  const qPrev = quotations.filter((q) => prev(quoteDate(q)))
  const quotedNow = sum(qNow.map(grand))
  const quotedPrev = sum(qPrev.map(grand))
  const rate = (list) => {
    const decided = list.filter((q) => DECIDED.has(q.status)).length
    const won = list.filter((q) => WON.has(q.status)).length
    return { pct: decided ? Math.round((won / decided) * 100) : null, decided, won }
  }
  const winNow = rate(qNow)
  const winPrev = rate(qPrev)

  // ---- leads: web enquiries + folded Anu calls ----
  const web = enquiries.filter((e) => e.source !== VOICE_SOURCE)
  const calls = voiceCalls(enquiries)
  const leadsIn = (test) => web.filter((e) => test(e.createdAt)).length + calls.filter((c) => test(c.startedAt || c.endedAt)).length
  const leadsNow = leadsIn(cur)
  const leadsPrev = leadsIn(prev)

  // ---- pipeline: what moved through each stage inside the window ----
  const invNow = live.filter((i) => i.status !== "draft" && cur(i.issueDate))
  const paidNow = invNow.filter((i) => resolveInvoiceStatus(i, payments) === "paid")
  const wonNow = qNow.filter((q) => WON.has(q.status))
  const pipeline = [
    { key: "leads", label: "Leads", count: leadsNow, value: null },
    { key: "quoted", label: "Quoted", count: qNow.length, value: quotedNow },
    { key: "won", label: "Won", count: wonNow.length, value: sum(wonNow.map(grand)) },
    { key: "invoiced", label: "Invoiced", count: invNow.length, value: sum(invNow.map(grand)) },
    { key: "paid", label: "Paid", count: paidNow.length, value: sum(paidNow.map(grand)) },
  ]

  // ---- open quotations by age (now, not windowed) ----
  const quoteAging = [
    { key: "0-7", label: "Under a week", max: 7, tone: "emerald", count: 0, value: 0 },
    { key: "8-15", label: "1–2 weeks", max: 15, tone: "amber", count: 0, value: 0 },
    { key: "16-30", label: "2–4 weeks", max: 30, tone: "amber", count: 0, value: 0 },
    { key: "30+", label: "Over a month", max: Infinity, tone: "rose", count: 0, value: 0 },
  ]
  for (const q of quotations) {
    if (!OPEN_QUOTE.has(q.status)) continue
    const age = Math.max(0, Math.floor((now - ms(quoteDate(q))) / DAY)) || 0
    const b = quoteAging.find((x) => age <= x.max)
    b.count += 1
    b.value = round2(b.value + grand(q))
  }

  // ---- receivables (now, not windowed) ----
  const receivables = [
    { key: "current", label: "Not yet due", tone: "emerald", count: 0, value: 0 },
    { key: "1-30", label: "1–30 days late", tone: "amber", count: 0, value: 0 },
    { key: "31-60", label: "31–60 days late", tone: "orange", count: 0, value: 0 },
    { key: "60+", label: "Over 60 days late", tone: "rose", count: 0, value: 0 },
  ]
  let outstanding = 0
  for (const inv of live) {
    if (inv.status === "draft") continue
    const bal = invoiceBalance(inv, payments)
    if (bal <= 0.5) continue
    outstanding = round2(outstanding + bal)
    const late = inv.dueDate ? Math.floor((now - ms(inv.dueDate)) / DAY) : 0
    const b = late <= 0 || Number.isNaN(late) ? receivables[0] : late <= 30 ? receivables[1] : late <= 60 ? receivables[2] : receivables[3]
    b.count += 1
    b.value = round2(b.value + bal)
  }
  const overdue = round2(outstanding - receivables[0].value)
  const revenue90 = sum(live.filter((i) => within(i.issueDate, now - 90 * DAY, now)).map((i) => i.totals?.taxable))
  const dso = revenue90 > 0 ? Math.round((outstanding / revenue90) * 90) : null

  return {
    range,
    days,
    noun,
    cash: { value: cashNow, prev: cashPrev, delta: delta(cashNow, cashPrev), pace },
    revenue: { value: revNow, prev: revPrev, delta: delta(revNow, revPrev) },
    quoted: { value: quotedNow, count: qNow.length, prev: quotedPrev, delta: delta(quotedNow, quotedPrev) },
    winRate: { ...winNow, prevPct: winPrev.pct, diff: winNow.pct != null && winPrev.pct != null ? winNow.pct - winPrev.pct : null },
    leads: { value: leadsNow, prev: leadsPrev, delta: delta(leadsNow, leadsPrev) },
    pipeline,
    quoteAging,
    openQuotes: { count: sum(quoteAging.map((b) => b.count)), value: sum(quoteAging.map((b) => b.value)) },
    receivables,
    outstanding,
    overdue,
    dso,
  }
}
