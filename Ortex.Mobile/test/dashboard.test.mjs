// The Home tab's numbers.
//
// Everything on the dashboard is derived from rows the phone already holds
// (src/domain/dashboard.ts), so the arithmetic is asserted here rather than
// eyeballed on a device: what counts as won, how a period compares with the one
// before it, how voice captures fold into one lead, and what lands in "Needs you
// today".

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { computeDashboard, computeWebTraffic, attentionItems, delta, channelOf, durationWords, leadsFrom } =
  await loadTs("domain/dashboard.ts")
const { VOICE_SOURCE } = await loadTs("domain/voice.ts")

// Noon local time, so "today" is unambiguous whatever zone the test runs in.
const NOW = new Date(2026, 8, 13, 12, 0, 0).getTime()
const DAY = 86400000
const HOUR = 3600000
const ago = (days) => new Date(NOW - days * DAY).toISOString()
const inDays = (days) => new Date(NOW + days * DAY).toISOString()

const customer = (over = {}) => ({ name: "Ravi Kumar", company: "", email: "", phone: "9876543210", ...over })

const enquiry = (over = {}) => ({
  id: "e1",
  createdAt: ago(1),
  customer: customer(),
  source: "Website contact form",
  productInterest: "",
  message: "",
  status: "new",
  ...over,
})

const quote = (over = {}) => ({
  id: "q1",
  number: "QTN-001",
  status: "sent",
  customer: customer({ company: "Acme" }),
  lines: [{ productId: "p1", description: "MDF name board", quantity: 100, rate: 50 }],
  totals: { grandTotal: 5900, lines: [{ taxable: 5000 }] },
  issueDate: ago(2),
  createdAt: ago(2),
  validUntil: inDays(20),
  enquiryId: null,
  lostReason: "",
  ...over,
})

test("delta: percent against the previous period, null when there is nothing to compare", () => {
  assert.deepEqual(delta(150, 100), { pct: 50, diff: 50, dir: "up" })
  assert.deepEqual(delta(50, 100), { pct: -50, diff: -50, dir: "down" })
  assert.equal(delta(5, 0).pct, null)
  assert.equal(delta(0, 0).dir, "flat")
})

test("voice captures of one call count as ONE lead", () => {
  const rows = [
    enquiry({ id: "v1", source: VOICE_SOURCE, createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    enquiry({ id: "v2", source: VOICE_SOURCE, createdAt: new Date(NOW - 2 * DAY + 60000).toISOString() }),
    enquiry({ id: "w1" }),
  ]
  const leads = leadsFrom(rows)
  assert.equal(leads.length, 2)
  const call = leads.find((l) => l.kind === "voice")
  assert.deepEqual([...call.rowIds].sort(), ["v1", "v2"])
})

test("period KPIs use the console's definitions and compare with the previous window", () => {
  const d = computeDashboard({
    range: "7d",
    now: NOW,
    enquiries: [enquiry({ id: "a", createdAt: ago(1) }), enquiry({ id: "b", createdAt: ago(3) }), enquiry({ id: "old", createdAt: ago(10) })],
    quotations: [
      quote({ id: "won", status: "accepted", issueDate: ago(1), totals: { grandTotal: 10000, lines: [] } }),
      quote({ id: "lost", status: "rejected", lostReason: "Price too high", issueDate: ago(2) }),
      quote({ id: "sent", status: "sent", issueDate: ago(3) }),
      quote({ id: "draft", status: "draft", issueDate: ago(1) }),
      quote({ id: "prevWon", status: "invoiced", issueDate: ago(9), totals: { grandTotal: 5000, lines: [] } }),
    ],
  })
  assert.equal(d.leads.total, 2)
  assert.equal(d.leads.prev, 1)
  assert.equal(d.leads.delta.pct, 100)
  // The draft is not "quoted".
  assert.equal(d.quoted.count, 3)
  assert.equal(d.quoted.value, 10000 + 5900 + 5900)
  assert.equal(d.won.value, 10000)
  assert.equal(d.won.delta.pct, 100)
  // Won over decided: accepted vs rejected; the open "sent" is undecided.
  assert.equal(d.winRate.pct, 50)
  assert.deepEqual(d.lostReasons, [{ reason: "Price too high", count: 1 }])
  assert.equal(d.trend.length, 7)
  assert.equal(d.trend.reduce((s, b) => s + b.web + b.voice, 0), 2)
  assert.deepEqual(d.funnel.map((f) => f.count), [2, 3, 1])
  // The draft IS in the status mix: unsent drafts are what that bar reveals.
  assert.ok(d.statusMix.some((s) => s.id === "draft"))
})

test("time to quote is the median gap from a lead to its first quotation", () => {
  const e1 = enquiry({ id: "e1", createdAt: new Date(NOW - 2 * DAY).toISOString() })
  const e2 = enquiry({ id: "e2", createdAt: new Date(NOW - 3 * DAY).toISOString() })
  const d = computeDashboard({
    range: "7d",
    now: NOW,
    enquiries: [e1, e2],
    quotations: [
      quote({ id: "a", enquiryId: "e1", createdAt: new Date(NOW - 2 * DAY + 2 * HOUR).toISOString() }),
      quote({ id: "b", enquiryId: "e1", createdAt: new Date(NOW - DAY).toISOString() }),
      quote({ id: "c", enquiryId: "e2", createdAt: new Date(NOW - 3 * DAY + 6 * HOUR).toISOString() }),
    ],
  })
  assert.equal(d.timeToQuote.samples, 2)
  assert.equal(d.timeToQuote.hours, 4)
  assert.equal(durationWords(4), "4 h")
  assert.equal(durationWords(72), "3 days")
  assert.equal(durationWords(null), "–")
})

test("open quotes are aged across all time and products ranked by taxable value", () => {
  const d = computeDashboard({
    range: "7d",
    now: NOW,
    quotations: [
      quote({ id: "fresh", issueDate: ago(2) }),
      quote({ id: "stale", issueDate: ago(40) }),
      quote({
        id: "big",
        issueDate: ago(1),
        lines: [
          { productId: "p2", description: "Acrylic trophy\nwith base", quantity: 10, rate: 900 },
          { productId: "p1", description: "MDF name board", quantity: 10, rate: 50 },
        ],
        totals: { grandTotal: 11210, lines: [{ taxable: 9000 }, { taxable: 500 }] },
      }),
    ],
  })
  assert.equal(d.aging[0].count, 2)
  assert.equal(d.aging[3].count, 1)
  assert.equal(d.topProducts[0].name, "Acrylic trophy")
  const mdf = d.topProducts.find((p) => p.name === "MDF name board")
  assert.equal(mdf.quotes, 2)
  assert.equal(mdf.value, 5500)
})

test("needs-attention: support first, then waiting leads and expiring quotes; access is honoured", () => {
  const enquiries = [
    enquiry({ id: "fresh", createdAt: new Date(NOW - 2 * HOUR).toISOString() }),
    enquiry({ id: "waiting", createdAt: ago(3) }),
    enquiry({ id: "done", status: "contacted", createdAt: ago(3) }),
    enquiry({
      id: "sup",
      source: VOICE_SOURCE,
      createdAt: ago(1),
      message: "Customer has a complaint about a damaged order",
      customer: customer({ phone: "9000000001" }),
    }),
  ]
  const quotations = [
    quote({ id: "exp", validUntil: inDays(1), totals: { grandTotal: 20000 } }),
    quote({ id: "chase", issueDate: ago(10), createdAt: ago(10), validUntil: inDays(20) }),
    quote({ id: "recent", issueDate: ago(1), validUntil: inDays(20) }),
  ]
  const items = attentionItems({ enquiries, quotations, now: NOW })
  const ids = items.map((i) => i.id)
  assert.equal(ids[0], "support-sup")
  assert.ok(ids.includes("enq-waiting"))
  assert.ok(ids.includes("enq-fresh"))
  assert.ok(!ids.includes("enq-done"))
  assert.ok(ids.includes("exp-exp"))
  assert.ok(ids.includes("chase-chase"))
  assert.ok(!ids.some((id) => id.endsWith("recent")))
  assert.ok(ids.indexOf("enq-waiting") < ids.indexOf("enq-fresh"))
  // Every row carries the number Home's Call button rings.
  assert.equal(items.find((i) => i.id === "support-sup").phone, "9000000001")
  assert.equal(items.find((i) => i.id === "enq-waiting").phone, "9876543210")

  const quotesOnly = attentionItems({ enquiries, quotations, now: NOW }, { enquiries: false, voice: false, quotations: true })
  assert.ok(quotesOnly.every((i) => i.target.screen === "QuotationDetail"))
})

test("website traffic: visitors, sessions, intent, gaps and places", () => {
  const row = (over) => ({ at: ago(1), userId: "u1", sessionId: "s1", activityType: "Home page visit", page: "Home", referrer: "Direct", device: "Mobile", city: "Jaipur", ...over })
  const w = computeWebTraffic({
    range: "7d",
    now: NOW,
    products: [{ name: "MDF name board", material: "MDF", category: "MDF products" }],
    activities: [
      row({}),
      row({ page: "Quote builder", pageUrl: "/quote" }),
      row({ activityType: "Product search", searchQuery: "Lanyard", page: "Products" }),
      row({ userId: "u2", sessionId: "s2", device: "Desktop", city: "Not collected", referrer: "https://www.google.com/search" }),
      row({ userId: "u2", sessionId: "s2", activityType: "Product search", searchQuery: "mdf", device: "Desktop", city: "Not collected" }),
      row({ userId: "u3", sessionId: "s3", at: ago(9) }),
    ],
  })
  assert.equal(w.visitors, 2)
  assert.equal(w.prevVisitors, 1)
  assert.equal(w.sessions, 2)
  assert.equal(w.quoteSessions, 1)
  assert.equal(w.mobileShare, 50)
  assert.deepEqual(w.demandGaps, [{ label: "lanyard", count: 1 }])
  assert.deepEqual(w.cities, [{ label: "Jaipur", count: 1 }])
  assert.deepEqual(w.channels.map((c) => c.label).sort(), ["Direct", "Organic search"])
  assert.equal(w.trend.length, 7)
})

test("pace is a running total per day, this window against the last on the same day index", () => {
  const d = computeDashboard({
    range: "7d",
    now: NOW,
    quotations: [
      quote({ id: "a", issueDate: ago(5), totals: { grandTotal: 1000 } }),
      quote({ id: "b", issueDate: ago(1), totals: { grandTotal: 500 } }),
      quote({ id: "p", issueDate: ago(12), totals: { grandTotal: 700 } }),
    ],
  })
  assert.equal(d.pace.current.length, 7)
  assert.equal(d.pace.previous.length, 7)
  assert.equal(d.pace.current[6], 1500)
  assert.equal(d.pace.previous[6], 700)
  // Monotonic: a running total never falls.
  assert.ok(d.pace.current.every((v, i, a) => i === 0 || v >= a[i - 1]))
})

test("heatmap buckets leads by local weekday and time band, and names the peak", () => {
  const at = (dayOffset, hour) => {
    const t = new Date(NOW - dayOffset * DAY)
    t.setHours(hour, 15, 0, 0)
    return t.toISOString()
  }
  const d = computeDashboard({
    range: "7d",
    now: NOW,
    enquiries: [
      enquiry({ id: "1", createdAt: at(7, 10) }),
      enquiry({ id: "2", createdAt: at(14, 11) }),
      enquiry({ id: "3", createdAt: at(1, 7) }),
      enquiry({ id: "old", createdAt: at(120, 10) }),
    ],
  })
  assert.equal(d.heatmap.total, 3)
  const weekday = (new Date(NOW - 7 * DAY).getDay() + 6) % 7
  assert.equal(d.heatmap.cells[weekday][0], 2)
  assert.deepEqual(d.heatmap.peak, { day: d.heatmap.days[weekday], band: "9–12", count: 2 })
  // 7am is a night-band lead on its own calendar day.
  const early = (new Date(NOW - DAY).getDay() + 6) % 7
  assert.equal(d.heatmap.cells[early][4], 1)
})

test("speed scale steps", async () => {
  const { speedStep } = await loadTs("domain/dashboard.ts")
  assert.equal(speedStep(null), -1)
  assert.equal(speedStep(0.5), 0)
  assert.equal(speedStep(3), 1)
  assert.equal(speedStep(20), 2)
  assert.equal(speedStep(100), 3)
})

test("channelOf buckets referrers the way the console does", () => {
  assert.equal(channelOf("Direct"), "Direct")
  assert.equal(channelOf("https://www.instagram.com/x"), "Social")
  assert.equal(channelOf("https://dir.indiamart.com/"), "Marketplace")
  assert.equal(channelOf("https://example.org/page"), "example.org")
})
