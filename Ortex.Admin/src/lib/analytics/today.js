// The Dashboard's numbers: what needs a person today, and how the chosen window
// is going against the one before it. Pure functions over the raw collections,
// every one taking `now` so a test is not a race with the clock.
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

// ---- cash flow ------------------------------------------------------------------

/**
 * Invoiced (grand total, by issue date, cancelled and drafts left out) against
 * collected and paid out (payments by date), per week for the last `weeks`
 * weeks. The last bucket ends now, so this week is always the right-hand bar.
 */
export function weeklyCash({ invoices = [], payments = [] }, weeks = 12, now = Date.now()) {
  const WEEK = 7 * DAY
  const start = now - weeks * WEEK
  const out = Array.from({ length: weeks }, (_, i) => ({
    label: new Date(start + i * WEEK + DAY).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    invoiced: 0,
    collected: 0,
    paidOut: 0,
  }))
  const slot = (ts) => {
    const i = Math.floor((ms(ts) - start) / WEEK)
    return i >= 0 && i < weeks ? out[i] : null
  }
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.status === "draft") continue
    const b = slot(inv.issueDate)
    if (b) b.invoiced = round2(b.invoiced + grand(inv))
  }
  for (const p of payments) {
    const b = slot(p.date)
    if (!b) continue
    if (p.type === "inflow") b.collected = round2(b.collected + (Number(p.amount) || 0))
    else b.paidOut = round2(b.paidOut + (Number(p.amount) || 0))
  }
  return out
}

/**
 * Invoiced / collected / paid out per calendar month, the last `months`
 * months, this month last. Same rules as weeklyCash.
 */
export function monthlyCash({ invoices = [], payments = [] }, months = 6, now = Date.now()) {
  const d = new Date(now)
  const keys = Array.from({ length: months }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (months - 1 - i), 1)
    return { key: `${m.getFullYear()}-${m.getMonth()}`, label: m.toLocaleDateString("en-IN", { month: "short" }), invoiced: 0, collected: 0, paidOut: 0 }
  })
  const slot = (ts) => {
    const t = new Date(ts)
    return Number.isNaN(t.getTime()) ? null : keys.find((k) => k.key === `${t.getFullYear()}-${t.getMonth()}`) || null
  }
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.status === "draft") continue
    const b = slot(inv.issueDate)
    if (b) b.invoiced = round2(b.invoiced + grand(inv))
  }
  for (const p of payments) {
    const b = slot(p.date)
    if (!b) continue
    if (p.type === "inflow") b.collected = round2(b.collected + (Number(p.amount) || 0))
    else b.paidOut = round2(b.paidOut + (Number(p.amount) || 0))
  }
  return keys.map(({ key: _key, ...rest }) => rest)
}

/**
 * The last `days` days of activity behind each headline figure, one value per
 * day, oldest first: cash collected, taxable revenue, invoiced (behind
 * Outstanding), quoted, new leads and quotations won (behind Win rate).
 */
export function dailySparks({ enquiries = [], quotations = [], invoices = [], payments = [] }, days = 14, now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0) - (days - 1) * DAY
  const blank = () => new Array(days).fill(0)
  const out = { cash: blank(), revenue: blank(), invoiced: blank(), quoted: blank(), leads: blank(), won: blank() }
  const add = (key, ts, v = 1) => {
    const i = Math.floor((ms(ts) - start) / DAY)
    if (i >= 0 && i < days) out[key][i] += Number(v) || 0
  }
  for (const p of payments) if (p.type === "inflow") add("cash", p.date, p.amount)
  for (const i of invoices) {
    if (i.status === "cancelled") continue
    add("revenue", i.issueDate, i.totals?.taxable)
    if (i.status !== "draft") add("invoiced", i.issueDate, grand(i))
  }
  for (const q of quotations) {
    add("quoted", quoteDate(q), grand(q))
    if (WON.has(q.status)) add("won", quoteDate(q))
  }
  for (const e of enquiries.filter((x) => x.source !== VOICE_SOURCE)) add("leads", e.createdAt)
  for (const c of voiceCalls(enquiries)) add("leads", c.startedAt || c.endedAt)
  return out
}

// ---- approvals ------------------------------------------------------------------

// Call agent outcomes that need a person next (pages/telecaller/helpers.js
// ACTION_OUTCOMES), in the words the queue shows.
const CALL_ACTION = { deal_closed: "Deal closed", needs_quote: "Needs a quote", complaint: "Complaint", interested: "Interested" }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayWords = (iso) => (iso ? `${Number(String(iso).slice(8, 10))} ${MONTHS[Number(String(iso).slice(5, 7)) - 1]}` : "")
const monthWords = (iso) => {
  const [y, m] = String(iso || "").split("-").map(Number)
  return m ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}` : ""
}

/**
 * The decisions waiting on a person, from the modules outside quote-to-cash:
 * leave and attendance corrections (an admin decides, never on one's own),
 * pay runs awaiting their second approver, social posts in review (admin-only
 * in the database) and Call agent calls that ended needing a human.
 *
 * Same item shape as attentionItems, so the Dashboard sorts them together.
 * `names` resolves a user id; `leaveTypes` a type code. `selfId` drops the
 * viewer's own leave and corrections: the database refuses those anyway.
 */
export function approvalItems(
  { leave = [], corrections = [], runs = [], social = [], calls = [] },
  { names = {}, leaveTypes = {}, selfId = null } = {},
  access = { leave: false, corrections: false, payroll: false, social: false, calls: false },
  now = Date.now(),
) {
  const out = []
  const who = (id) => names[id] || "Someone"

  if (access.leave) {
    for (const r of leave) {
      if (r.status !== "pending" || r.user_id === selfId) continue
      const starts = Math.ceil((ms(r.from_day) - now) / DAY)
      const days = Number(r.days) || 0
      // The type's own name ("Casual leave", "Comp-off"), else the code.
      const type = (leaveTypes[r.type_code] || r.type_code || "Leave").toLowerCase()
      out.push({
        id: `leave-${r.id}`,
        group: "approvals",
        priority: starts <= 2 ? 0 : 1,
        tone: "violet",
        kind: "Leave",
        title: `${who(r.user_id)} · ${type}, ${days === 1 ? "1 day" : `${days} days`}`,
        detail: `${dayWords(r.from_day)}${r.to_day !== r.from_day ? ` to ${dayWords(r.to_day)}` : ""} · ${r.reason || "No reason given"}`,
        to: "/attendance?tab=leave",
      })
    }
  }

  if (access.corrections) {
    for (const c of corrections) {
      if (c.status !== "pending" || c.user_id === selfId) continue
      out.push({
        id: `corr-${c.id}`,
        group: "approvals",
        priority: 1,
        tone: "violet",
        kind: "Correction",
        title: `${who(c.user_id)} · attendance correction for ${dayWords(c.day)}`,
        detail: c.reason || "No reason given",
        to: "/attendance?tab=corrections",
      })
    }
  }

  if (access.payroll) {
    for (const r of runs) {
      if (r.status !== "pending_approval") continue
      out.push({
        id: `run-${r.id}`,
        group: "approvals",
        priority: 0,
        tone: "violet",
        kind: "Pay run",
        title: `${r.title || monthWords(r.month)} pay run is waiting for approval`,
        detail: `${r.pay_date ? `Pay day ${dayWords(r.pay_date)} · ` : ""}needs a second person`,
        amount: Number(r.totals?.netPay) || 0,
        to: "/payroll?tab=runs",
      })
    }
  }

  if (access.social) {
    for (const p of social) {
      if (p.status !== "review") continue
      const when = p.scheduledFor ? ` · for ${dayWords(new Date(p.scheduledFor).toISOString())}` : ""
      out.push({
        id: `social-${p.id}`,
        group: "approvals",
        priority: 1,
        tone: "violet",
        kind: "Social post",
        title: `“${p.topic || "Untitled post"}” is waiting for approval`,
        detail: `${(p.platforms || []).join(", ") || "No platform chosen"}${when}`,
        to: "/social",
        state: { openId: p.id },
      })
    }
  }

  if (access.calls) {
    for (const c of calls) {
      const outcome = c.analysis?.outcome
      if (c.status !== "completed" || !CALL_ACTION[outcome] || c.handled) continue
      const age = now - ms(c.createdAt)
      if (!(age >= 0 && age <= 14 * DAY)) continue
      out.push({
        id: `tc-${c.id}`,
        group: "leads",
        priority: outcome === "complaint" || outcome === "deal_closed" ? 0 : 2,
        tone: outcome === "complaint" ? "rose" : "blue",
        kind: CALL_ACTION[outcome],
        title: `Call agent · ${c.contactName || "Unknown contact"}`,
        detail: c.analysis?.nextAction || c.analysis?.summary || `Call ${ageWords(age)}`,
        amount: Number(c.analysis?.estimatedValue) || 0,
        phone: c.phone || "",
        to: "/telecaller?tab=calls",
      })
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
