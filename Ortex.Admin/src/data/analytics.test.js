// Regression tests for the analytics layer — the pure functions behind the
// Growth Intelligence dashboard and the money math on the main Dashboard.
//
// All fixtures use timestamps RELATIVE to now (daysAgo) with the rolling "30d"
// period, so the tests are deterministic on any run date. computeCohorts takes
// an explicit `now` for the same reason.

import { describe, it, expect } from "vitest"
import {
  computeAnalytics,
  computeGrowthAnalytics,
  computeAttribution,
  computeVelocity,
  computeCohorts,
  computeMessagingImpact,
  classifyActivity,
  median,
} from "./analytics"

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

describe("classifyActivity", () => {
  it("maps both event vocabularies (human activityType and machine eventType)", () => {
    expect(classifyActivity({ activityType: "Product search" })).toBe("search")
    expect(classifyActivity({ eventType: "search_performed" })).toBe("search")
    expect(classifyActivity({ activityType: "Product page visit" })).toBe("view")
    expect(classifyActivity({ eventType: "product_visited" })).toBe("view")
    expect(classifyActivity({ activityType: "Quote request" })).toBe("quote")
    expect(classifyActivity({ eventType: "quote_requested" })).toBe("quote")
    expect(classifyActivity({ eventType: "cart_added" })).toBe("cart")
    expect(classifyActivity({ eventType: "pdf_downloaded" })).toBe("download")
    expect(classifyActivity({})).toBe("other")
  })
})

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(null)
  })
})

describe("computeGrowthAnalytics", () => {
  // Visitor A browsed 60 days ago (returning), quotes in-period via Google.
  // Visitor B is new, searches for something we don't sell, via Instagram.
  const activities = [
    { userId: "A", sessionId: "s1", activityType: "Product search", metadata: { searchQuery: "acrylic trophy" }, timestamp: daysAgo(60), referrer: "Direct", device: "Desktop" },
    { userId: "A", sessionId: "s2", activityType: "Product page visit", metadata: { productName: "MDF Trophy" }, timestamp: daysAgo(3), referrer: "https://www.google.com/", device: "Desktop" },
    { userId: "A", sessionId: "s2", activityType: "Quote request", timestamp: daysAgo(3), referrer: "https://www.google.com/", device: "Desktop" },
    { userId: "B", sessionId: "s3", eventType: "search_performed", metadata: { query: "bamboo lanyard" }, timestamp: daysAgo(2), referrer: "https://instagram.com/", device: "Mobile" },
    { userId: "B", sessionId: "s3", eventType: "product_visited", metadata: { productName: "Lanyard" }, timestamp: daysAgo(2), referrer: "https://instagram.com/", device: "Mobile" },
  ]
  const products = [
    { name: "MDF Trophy", material: "MDF", category: "Awards" },
    { name: "Acrylic Trophy", material: "Acrylic", category: "Awards" },
    { name: "Lanyard", material: "Polyester", category: "Lanyards" },
  ]
  const g = computeGrowthAnalytics({ activities, products }, "30d")

  it("counts visitors, splitting new vs returning by first-ever visit", () => {
    expect(g.visitors).toBe(2)
    expect(g.newVisitors).toBe(1) // B — A was first seen 60 days ago
    expect(g.returningVisitors).toBe(1)
  })

  it("folds activities into sessions and measures engagement", () => {
    expect(g.sessionCount).toBe(2) // s2, s3 in-window; s1 is not
    expect(g.engagedSessions).toBe(2)
    expect(g.quoteSessionCount).toBe(1)
    expect(g.visitorToQuote).toBe(50)
  })

  it("classifies acquisition channels from referrers", () => {
    const byChannel = Object.fromEntries(g.channels.map((c) => [c.channel, c.count]))
    expect(byChannel["Organic search"]).toBe(1)
    expect(byChannel["Social"]).toBe(1)
  })

  it("flags searched terms with no matching product as demand gaps", () => {
    expect(g.demandGaps).toEqual([{ query: "bamboo lanyard", count: 1 }])
  })

  it("builds the behavioral funnel head", () => {
    const byStage = Object.fromEntries(g.funnel.map((f) => [f.stage, f.count]))
    expect(byStage["Visitors"]).toBe(2)
    expect(byStage["Sessions"]).toBe(2)
    expect(byStage["Engaged"]).toBe(2)
    expect(byStage["Quote requests"]).toBe(1)
  })
})

describe("computeAttribution", () => {
  // X was tracked (quote request via Google, older than the period — the
  // attribution map is lifetime) and invoiced in-period; Y never touched the web.
  const activities = [
    { metadata: { customer: { email: "X@Co.com", phone: "+91-9810000000" } }, timestamp: daysAgo(40), referrer: "https://www.google.com/", activityType: "Quote request" },
    { activityType: "Product page visit", productId: "P1", metadata: { productName: "Trophy" }, timestamp: daysAgo(3), referrer: "https://www.google.com/" },
  ]
  const enquiries = [
    { id: "E1", customer: { email: "x@co.com" }, submittedAt: daysAgo(40), source: "Quote calculator", tracking: { userId: "usr_1", sessionId: "s1" } },
  ]
  const quotations = [{ enquiryId: "E1", status: "accepted", lines: [{ productId: "P1" }] }]
  const invoices = [
    { status: "sent", issueDate: daysAgo(5), customer: { email: "x@co.com" }, totals: { taxable: 1000 } },
    { status: "sent", issueDate: daysAgo(4), customer: { email: "y@other.com" }, totals: { taxable: 500 } },
  ]
  const products = [{ id: "P1", name: "Trophy" }]
  const a = computeAttribution({ activities, enquiries, quotations, invoices, products }, "30d")

  it("attributes revenue to web-touched contacts (case-insensitive email join)", () => {
    expect(a.totalRevenue).toBe(1500)
    expect(a.webInfluencedRevenue).toBe(1000)
    expect(a.webShare).toBe(67)
  })

  it("assigns first-touch channel revenue", () => {
    expect(a.channelRevenue).toEqual([{ channel: "Organic search", revenue: 1000 }])
  })

  it("converts tracked enquiries through the quotation chain", () => {
    expect(a.trackedEnquiryCount).toBe(1)
    expect(a.trackedWon).toBe(1)
    expect(a.trackedConversion).toBe(100)
  })

  it("pairs product views with won orders", () => {
    expect(a.productPerformance).toEqual([{ name: "Trophy", views: 1, orders: 1, rate: 100 }])
  })
})

describe("computeVelocity", () => {
  // Full chain: enquiry d-20 → quote d-18 → invoice d-15 → settled d-11.
  const enquiries = [{ id: "E1", submittedAt: daysAgo(20) }]
  const quotations = [{ id: "Q1", enquiryId: "E1", issueDate: daysAgo(18), status: "invoiced" }]
  const invoices = [{ id: "I1", quotationId: "Q1", issueDate: daysAgo(15), status: "sent", totals: { grandTotal: 100 } }]
  const payments = [{ invoiceId: "I1", type: "inflow", amount: 100, date: daysAgo(11) }]
  const v = computeVelocity({ enquiries, quotations, invoices, payments })

  it("measures median days per stage and the full cycle", () => {
    expect(v.enquiryToQuote).toBe(2)
    expect(v.quoteToInvoice).toBe(3)
    expect(v.invoiceToPaid).toBe(4)
    expect(v.fullCycle).toBe(9)
    expect(v.samples).toEqual({ enquiryToQuote: 1, quoteToInvoice: 1, invoiceToPaid: 1, fullCycle: 1 })
  })

  it("excludes unpaid invoices from settlement timing", () => {
    const unpaid = computeVelocity({ enquiries, quotations, invoices, payments: [] })
    expect(unpaid.invoiceToPaid).toBe(null)
    expect(unpaid.fullCycle).toBe(null)
    expect(unpaid.enquiryToQuote).toBe(2) // earlier stages unaffected
  })
})

describe("computeCohorts", () => {
  const now = new Date(2026, 6, 15) // fixed: 15 Jul 2026
  const enquiries = [
    { id: "E1", submittedAt: "2026-07-02" },
    { id: "E2", submittedAt: "2026-06-10" },
    { id: "E3", submittedAt: "2026-06-20" },
  ]
  const quotations = [
    { enquiryId: "E2", status: "accepted" },
    { enquiryId: "E3", status: "sent" },
  ]
  const rows = computeCohorts({ enquiries, quotations }, 6, now)

  it("groups enquiries by intake month with quoted/won conversion", () => {
    expect(rows).toHaveLength(6)
    const june = rows[4]
    const july = rows[5]
    expect(june).toMatchObject({ enquiries: 2, quoted: 2, won: 1, quotedPct: 100, wonPct: 50 })
    expect(july).toMatchObject({ enquiries: 1, quoted: 0, won: 0, quotedPct: 0, wonPct: 0 })
  })

  it("reports null percentages for empty months instead of fake zeros", () => {
    expect(rows[0]).toMatchObject({ enquiries: 0, quotedPct: null, wonPct: null })
  })
})

describe("computeMessagingImpact", () => {
  const whatsappLogs = [
    { phone: "+91 9810000000", status: "sent", createdAt: daysAgo(10), eventType: "quote_requested" },
    { phone: "+91 9899999999", status: "sent", createdAt: daysAgo(10), eventType: "cart_added" },
    { phone: "+91 9810000000", status: "queued", createdAt: daysAgo(1), eventType: "quote_requested" }, // not dispatched
  ]
  const quotations = [{ status: "accepted", customer: { phone: "919810000000" }, issueDate: daysAgo(5) }]
  const m = computeMessagingImpact({ whatsappLogs, quotations, invoices: [] })

  it("counts only dispatched messages and matches later wins by normalized phone", () => {
    expect(m.totalDispatched).toBe(2)
    expect(m.orderedAfter).toBe(1) // the 98999… recipient never ordered
    expect(m.orderedRate).toBe(50)
  })

  it("breaks impact down per trigger", () => {
    const byTrigger = Object.fromEntries(m.byTrigger.map((t) => [t.trigger, t]))
    expect(byTrigger["quote_requested"]).toMatchObject({ dispatched: 1, ordered: 1 })
    expect(byTrigger["cart_added"]).toMatchObject({ dispatched: 1, ordered: 0 })
  })

  it("returns null rate with no dispatches instead of advertising success", () => {
    expect(computeMessagingImpact({ whatsappLogs: [], quotations: [], invoices: [] }).orderedRate).toBe(null)
  })
})

describe("computeAnalytics (pre-existing money math, sanity)", () => {
  const data = {
    payments: [{ type: "inflow", amount: 500, date: daysAgo(3) }],
    invoices: [{ status: "sent", issueDate: daysAgo(2), totals: { taxable: 1000 } }],
    quotations: [
      { status: "accepted", totals: { grandTotal: 800 } },
      { status: "rejected", totals: { grandTotal: 400 }, lostReason: "Price" },
    ],
    enquiries: [],
    products: [],
  }
  const a = computeAnalytics(data, "30d")

  it("computes cash collected, revenue and win rate", () => {
    expect(a.cashCollected).toBe(500)
    expect(a.revenue).toBe(1000)
    expect(a.winRate).toBe(50)
    expect(a.reasonsLost).toEqual([{ reason: "Price", count: 1 }])
  })
})
