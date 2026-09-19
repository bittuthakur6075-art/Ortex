// The words the bot sends: the daily digest, the weekly report and the short
// reports behind the "today" / "week" / "due" / "leads" / "quotes" / "website"
// commands. Pure: (data, now, tz) -> WhatsApp text, tested in test/reports.test.js.
//
// Every figure comes from the console's own functions (admin.js), so "leads",
// "won", "overdue" and "outstanding" mean exactly what they mean on the
// Dashboard. WhatsApp formatting: *bold*, _italic_. No em dashes, per the house
// style of every other Ortex screen.
import {
  computeToday, attentionItems, voiceCalls, formatCurrency,
  buildVisitors, summariseVisitors, productOf, WON, VOICE_SOURCE, DAY,
} from "./admin.js"
import { dayLabel, shortDate } from "./time.js"

const HOUR = 3600000
const ALL_ACCESS = { invoices: true, enquiries: true, voice: true, quotations: true }
const MARK = { rose: "🔴", amber: "🟠", blue: "🔵", emerald: "🟢" }

// ₹1.25L, ₹48K, ₹950. Compact, because this is read on a phone.
export const money = (v) => formatCurrency(v, { compact: true }).replace(/\.00$/, "")
const ms = (ts) => new Date(ts).getTime() || 0
const within = (ts, from, to) => ms(ts) >= from && ms(ts) < to
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const sumOf = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const bracket = (s) => (s ? ` (${s})` : "")

// "↑ 12% vs last week", "same as last week", "new vs last week".
export function change(d, noun = "last week") {
  if (!d) return ""
  if (d.pct == null) return d.diff > 0 ? `new vs ${noun}` : ""
  if (d.dir === "flat") return `same as ${noun}`
  return `${d.dir === "up" ? "↑" : "↓"} ${Math.abs(d.pct)}% vs ${noun}`
}

// The Dashboard's "Needs you today" list, numbered.
export function needsYou(data, now, max = 8) {
  const items = attentionItems(data, ALL_ACCESS, now)
  if (!items.length) return "*Needs you today*\nNothing is waiting. 👍"
  const lines = items.slice(0, max).map((i, n) => {
    const amount = i.amount ? ` · ${money(i.amount)}` : ""
    return `${n + 1}. ${MARK[i.tone] || "•"} *${i.kind}*: ${i.title}${amount}\n     _${i.detail}_`
  })
  const more = items.length > max ? `\n…and ${items.length - max} more on the console Dashboard.` : ""
  return `*Needs you today* (${items.length})\n${lines.join("\n")}${more}`
}

// What happened in [from, to).
export function activityBetween(data, from, to) {
  const { enquiries = [], quotations = [], invoices = [], payments = [], activities = [] } = data
  const web = enquiries.filter((e) => e.source !== VOICE_SOURCE && within(e.createdAt, from, to))
  const calls = voiceCalls(enquiries).filter((c) => within(c.startedAt || c.endedAt, from, to))
  const quotes = quotations.filter((q) => within(q.issueDate || q.createdAt, from, to))
  // A quotation carries no "won at" date, so "won" here means marked won
  // (accepted or invoiced) by an edit inside the window.
  const won = quotations.filter((q) => WON.has(q.status) && within(q.updatedAt, from, to))
  const cash = payments.filter((p) => p.type === "inflow" && within(p.createdAt, from, to))
  const raised = invoices.filter((i) => !["draft", "cancelled"].includes(i.status) && within(i.createdAt, from, to))
  const visitors = buildVisitors(activities.filter((a) => within(a.timestamp, from, to)), enquiries)
  return {
    web, calls, quotes, won, cash, raised,
    quotedValue: sumOf(quotes, (q) => q.totals?.grandTotal),
    wonValue: sumOf(won, (q) => q.totals?.grandTotal),
    cashValue: sumOf(cash, (p) => p.amount),
    raisedValue: sumOf(raised, (i) => i.totals?.grandTotal),
    site: summariseVisitors(visitors),
  }
}

function activityLines(a) {
  const leads = a.web.length + a.calls.length
  const split = leads ? ` (${plural(a.web.length, "website enquiry", "website enquiries")}, ${plural(a.calls.length, "Anu call")})` : ""
  return [
    `• New leads: *${leads}*${split}`,
    `• Quotations made: *${a.quotes.length}*${a.quotes.length ? ` worth ${money(a.quotedValue)}` : ""}`,
    `• Quotations won: *${a.won.length}*${a.won.length ? ` worth ${money(a.wonValue)}` : ""}`,
    `• Invoices raised: *${a.raised.length}*${a.raised.length ? ` worth ${money(a.raisedValue)}` : ""}`,
    `• Payments received: *${money(a.cashValue)}*${a.cash.length ? ` (${plural(a.cash.length, "payment")})` : ""}`,
    `• Website: *${plural(a.site.total, "visitor")}*, ${a.site.enquired} sent an enquiry, ${a.site.hot} close to enquiring`,
  ].join("\n")
}

function moneyBlock(data, now) {
  const r = computeToday(data, "30d", now)
  if (!r.outstanding) return "*Money*\nNothing outstanding. Every invoice is paid."
  const overdue = r.overdue ? `, of which *${money(r.overdue)}* is overdue` : ", none of it overdue"
  return `*Money*\n${money(r.outstanding)} to collect${overdue}.`
}

export function dailyDigest(data, now, tz) {
  const a = activityBetween(data, now - 24 * HOUR, now)
  return [
    `🤖 *Ortex daily update* · ${dayLabel(now, tz)}`,
    `*Last 24 hours*\n${activityLines(a)}`,
    needsYou(data, now),
    moneyBlock(data, now),
    `_Reply *help* to see what you can ask me._`,
  ].join("\n\n")
}

// The rolling-window report: 7 / 30 / 90 days, the Dashboard's own windows.
export function periodReport(data, now, tz, range = "7d") {
  const r = computeToday(data, range, now)
  const noun = { "7d": "last week", "30d": "the 30 days before", "90d": "the 90 days before" }[range] || "before"
  const from = now - r.days * DAY
  const win = r.winRate.pct == null ? "no quotations decided yet" : `${r.winRate.pct}% (${r.winRate.won} of ${r.winRate.decided} decided)`
  const old = r.quoteAging.find((b) => b.key === "30+")
  const stale = old?.count ? `, ${plural(old.count, "quotation")} older than a month` : ""
  const late = r.receivables.filter((b) => b.key !== "current" && b.count)

  return [
    `🤖 *Ortex report, last ${r.days} days* · ${shortDate(from, tz)} to ${shortDate(now, tz)}`,
    [
      "*Sales*",
      `• Leads: *${r.leads.value}*${bracket(change(r.leads.delta, noun))}`,
      `• Quoted: *${money(r.quoted.value)}* across ${plural(r.quoted.count, "quotation")}${bracket(change(r.quoted.delta, noun))}`,
      `• Win rate: *${win}*`,
      `• Invoiced (before tax): *${money(r.revenue.value)}*${bracket(change(r.revenue.delta, noun))}`,
      `• Cash in: *${money(r.cash.value)}*${bracket(change(r.cash.delta, noun))}`,
    ].join("\n"),
    ["*Pipeline*", `• Open quotations: *${r.openQuotes.count}* worth ${money(r.openQuotes.value)}${stale}`].join("\n"),
    [
      "*To collect*",
      `• Outstanding: *${money(r.outstanding)}*${r.dso != null ? ` (about ${r.dso} days of sales)` : ""}`,
      ...(late.length ? late.map((b) => `• ${b.label}: ${money(b.value)} on ${plural(b.count, "invoice")}`) : ["• Nothing overdue"]),
    ].join("\n"),
    websiteReport(data, now, r.days, { heading: "*Website*" }),
  ].join("\n\n")
}

export function weeklyDigest(data, now, tz) {
  return `${periodReport(data, now, tz, "7d")}\n\n${needsYou(data, now, 5)}`
}

const topCounts = (values, n) => {
  const counts = new Map()
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

// Visitors, how interested they were, what they looked at, where they came from.
export function websiteReport(data, now, days = 7, { heading } = {}) {
  const { activities = [], enquiries = [] } = data
  const from = now - days * DAY
  const cur = activities.filter((a) => within(a.timestamp, from, now))
  const prev = activities.filter((a) => within(a.timestamp, from - days * DAY, from))
  const visitors = buildVisitors(cur, enquiries)
  const s = summariseVisitors(visitors)
  const before = summariseVisitors(buildVisitors(prev, enquiries)).total
  const trend = before ? ` (${s.total >= before ? "↑" : "↓"} from ${before})` : ""

  const products = topCounts(cur.map(productOf), 3)
  const searches = topCounts(cur.filter((a) => a.activityType === "Product search").map((a) => (a.metadata?.searchQuery || "").trim().toLowerCase()), 3)
  const sources = topCounts(visitors.map((v) => v.source), 4)

  const lines = [
    heading || `🤖 *Website, last ${plural(days, "day")}*`,
    `• Visitors: *${s.total}*${trend}, ${s.mobile} on a phone`,
    `• Sent an enquiry: *${s.enquired}* · Close to enquiring: *${s.hot}* · Came back: *${s.returning}*`,
  ]
  if (products.length) lines.push(`• Most viewed: ${products.map(([p, n]) => `${p} (${n})`).join(", ")}`)
  if (searches.length) lines.push(`• Searched for: ${searches.map(([q, n]) => `"${q}" (${n})`).join(", ")}`)
  if (sources.length) lines.push(`• Came from: ${sources.map(([src, n]) => `${src} ${n}`).join(", ")}`)
  return lines.join("\n")
}

// Leads nobody has contacted yet: new web enquiries and Anu calls.
export function leadsReport(data, now, max = 10) {
  const items = attentionItems(data, { enquiries: true, voice: true, invoices: false, quotations: false }, now)
  if (!items.length) return "🤖 *Open leads*\nEvery lead has been contacted. 👍"
  const lines = items.slice(0, max).map((i, n) =>
    `${n + 1}. ${MARK[i.tone] || "•"} *${i.title}*${i.phone ? ` · ${i.phone}` : ""}\n     _${i.kind}: ${i.detail}_`)
  return `🤖 *Open leads* (${items.length})\n${lines.join("\n")}${items.length > max ? `\n…and ${items.length - max} more.` : ""}`
}

export function quotesReport(data, now, max = 10) {
  const open = (data.quotations || []).filter((q) => q.status === "sent")
  const head = `🤖 *Quotations*\n${plural(open.length, "quotation")} sent and waiting, worth ${money(sumOf(open, (q) => q.totals?.grandTotal))}.`
  const items = attentionItems(data, { quotations: true, enquiries: false, voice: false, invoices: false }, now)
  if (!items.length) return `${head}\nNone is expiring or due a chase.`
  const lines = items.slice(0, max).map((i, n) =>
    `${n + 1}. ${MARK[i.tone] || "•"} *${i.kind}*: ${i.title} · ${money(i.amount)}\n     _${i.detail}_`)
  return `${head}\n\n*To follow up*\n${lines.join("\n")}`
}

export function dueReport(data, now, max = 10) {
  const r = computeToday(data, "30d", now)
  const head = `🤖 *To collect*\nOutstanding *${money(r.outstanding)}*, overdue *${money(r.overdue)}*.`
  const items = attentionItems(data, { invoices: true, enquiries: false, voice: false, quotations: false }, now)
  if (!items.length) return `${head}\nNothing is overdue or due in the next 3 days.`
  const lines = items.slice(0, max).map((i, n) =>
    `${n + 1}. ${MARK[i.tone] || "•"} ${i.title} · *${money(i.amount)}*${i.phone ? ` · ${i.phone}` : ""}\n     _${i.kind}: ${i.detail}_`)
  return `${head}\n\n${lines.join("\n")}${items.length > max ? `\n…and ${items.length - max} more.` : ""}`
}
