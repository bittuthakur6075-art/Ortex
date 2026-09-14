import { describe, expect, it } from "vitest"
import { attentionCounts, briefing, cardFor, draftLines, findCustomers, findEnquiries, findQuotations, matchScore, money, routeFor, salesSummary } from "./anu"
import { VOICE_SOURCE } from "../pages/voice-leads/helpers"

const NOW = new Date("2026-09-14T10:00:00Z").getTime()
const DAY = 86400000
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString()
const ALL = { enquiries: true, voice: true, quotations: true, customers: true, products: true }

const enquiries = [
  { id: "e1", source: "Website contact form", status: "new", createdAt: iso(3), customer: { name: "Rahul Sharma", phone: "+91 98765 43210" }, productInterest: "Satin lanyards" },
  { id: "e2", source: "Quote calculator", status: "contacted", createdAt: iso(1), customer: { company: "Acme Corp" }, productInterest: "Acrylic trophy" },
  { id: "v1", source: VOICE_SOURCE, status: "new", createdAt: iso(0), customer: { name: "Priya", phone: "9811122233" }, productInterest: "ID cards", message: "" },
]

const quotations = [
  { id: "q1", number: "QT-0001", status: "sent", createdAt: iso(10), issueDate: iso(10), validUntil: new Date(NOW + 2 * DAY).toISOString(), customer: { name: "Rahul Sharma", phone: "9876543210" }, totals: { grandTotal: 48000 }, lines: [{ description: "Satin lanyard" }] },
  { id: "q2", number: "QT-0002", status: "accepted", createdAt: iso(5), issueDate: iso(5), customer: { company: "Acme Corp" }, totals: { grandTotal: 120000.4 } },
  { id: "q3", number: "QT-0003", status: "rejected", createdAt: iso(4), issueDate: iso(4), customer: { company: "Beta" }, totals: { grandTotal: 1000 } },
]

describe("matchScore", () => {
  it("matches a phone typed any way on its last 10 digits", () => {
    expect(matchScore("98765 43210", ["+91-9876543210"])).toBe(10)
  })
  it("needs every word somewhere, in any field", () => {
    expect(matchScore("sharma lanyards", ["Rahul Sharma", "Satin lanyards"])).toBeGreaterThan(0)
    expect(matchScore("sharma trophy", ["Rahul Sharma", "Satin lanyards"])).toBe(0)
  })
})

describe("answers", () => {
  it("speaks money in whole rupees with Indian grouping", () => {
    expect(money(120000.4)).toBe("₹1,20,000")
  })

  it("briefs only on modules the person can open", () => {
    const b = briefing({ enquiries, quotations }, { ...ALL, quotations: false }, NOW)
    expect(b.new_enquiries.count).toBe(1)
    expect(b.new_enquiries.waiting_over_2_days).toBe(1)
    expect(b.anu_calls_to_return.count).toBe(1)
    expect(b.quotations).toBeUndefined()
  })

  it("counts what the panel's For you list offers", () => {
    expect(attentionCounts({ enquiries, quotations }, ALL, NOW)).toMatchObject({ newEnquiries: 1, callsToReturn: 1, expiring: 1, waiting: 1 })
  })

  it("keeps web enquiries and Anu calls apart by access", () => {
    expect(findEnquiries(enquiries, {}, { enquiries: true, voice: false }, NOW).results.map((r) => r.kind)).not.toContain("voice_call")
    expect(findEnquiries(enquiries, { query: "priya" }, { enquiries: true, voice: true }, NOW).results[0].kind).toBe("voice_call")
  })

  it("links a customer to their quotations by phone", () => {
    const [c] = findCustomers([{ id: "c1", name: "Rahul Sharma", phone: "+91 98765 43210" }], quotations, "rahul")
    expect(c.quotations).toBe(1)
    expect(c.last_quotation).toContain("QT-0001")
  })

  it("finds quotations by item and totals them", () => {
    const out = findQuotations(quotations, { query: "lanyard" })
    expect(out.total).toBe(1)
    expect(out.total_value).toBe("₹48,000")
  })

  it("win rate counts decided quotations only", () => {
    expect(salesSummary({ enquiries, quotations }, 30, ALL, NOW).win_rate).toBe("50%")
  })

  it("drafts priced lines from the catalogue and keeps unknown items at rate 0", () => {
    const products = [{ id: "p1", name: "Satin Lanyard", basePrice: 25, gstRate: 18, moq: 100, hsn: "6307", status: "active" }]
    const { lines, unmatched } = draftLines(products, [{ product: "satin lanyard", quantity: "50" }, { product: "gold plated crown" }])
    expect(lines[0]).toMatchObject({ productId: "p1", rate: 25, quantity: 100 })
    expect(lines[1]).toMatchObject({ description: "gold plated crown", rate: 0 })
    expect(unmatched).toEqual(["gold plated crown"])
  })
})

describe("panel plumbing", () => {
  it("turns a result into an openable card", () => {
    expect(cardFor({ id: "q1", kind: "quotation", number: "QT-0001", customer: "Rahul", status: "Sent", value: "₹48,000" })).toMatchObject({ title: "Quotation QT-0001", subtitle: "Rahul · Sent · ₹48,000" })
    expect(cardFor({ name: "no id" })).toBeNull()
  })

  it("routes every kind to a console page", () => {
    expect(routeFor("customer", "c1").to).toBe("/customers/c1")
    expect(routeFor("voice_call", "v1")).toEqual({ to: "/crm?tab=voice", state: { openId: "v1" } })
    expect(routeFor("nope", "x")).toBeNull()
  })
})
