// The Dashboard's pure layer. Every fixture is dated relative to a fixed `now`,
// so the suite gives the same answer on any day it runs.

import { describe, it, expect } from "vitest"
import { attentionItems, computeToday, delta, DAY } from "./today"
import { VOICE_SOURCE } from "../../pages/voice-leads/helpers"

const NOW = new Date("2026-09-14T12:00:00Z").getTime()
const ago = (days) => new Date(NOW - days * DAY).toISOString()
const ahead = (days) => new Date(NOW + days * DAY).toISOString()

describe("delta", () => {
  it("reports percentage change, and none against a zero", () => {
    expect(delta(120, 100)).toEqual({ pct: 20, diff: 20, dir: "up" })
    expect(delta(50, 100)).toEqual({ pct: -50, diff: -50, dir: "down" })
    expect(delta(10, 0)).toEqual({ pct: null, diff: 10, dir: "up" })
    expect(delta(0, 0)).toEqual({ pct: null, diff: 0, dir: "flat" })
  })
})

describe("attentionItems", () => {
  const invoices = [
    { id: "i1", number: "INV-1", status: "sent", issueDate: ago(50), dueDate: ago(40), totals: { grandTotal: 1000 }, customer: { company: "Late Co" } },
    { id: "i2", number: "INV-2", status: "sent", issueDate: ago(5), dueDate: ahead(2), totals: { grandTotal: 500 }, customer: { company: "Soon Co" } },
    { id: "i3", number: "INV-3", status: "sent", issueDate: ago(50), dueDate: ago(40), totals: { grandTotal: 800 }, customer: { company: "Paid Co" } },
    { id: "i4", number: "INV-4", status: "sent", issueDate: ago(5), dueDate: ahead(20), totals: { grandTotal: 900 }, customer: { company: "Fine Co" } },
  ]
  const payments = [{ id: "p1", type: "inflow", invoiceId: "i3", amount: 800, date: ago(1) }]
  const enquiries = [
    { id: "e1", source: "Website contact form", status: "new", createdAt: ago(3), customer: { name: "Asha" } },
    { id: "e2", source: "Website contact form", status: "contacted", createdAt: ago(1), customer: { name: "Done" } },
    { id: "v1", source: VOICE_SOURCE, status: "new", createdAt: new Date(NOW - 2 * 3600000).toISOString(), message: "Wants 200 lanyards", customer: { name: "Ravi", phone: "9876543210" } },
    { id: "v2", source: VOICE_SOURCE, status: "new", createdAt: new Date(NOW - 2 * 3600000 - 60000).toISOString(), message: "Wants lanyards", customer: { name: "Ravi", phone: "9876543210" } },
  ]
  const quotations = [
    { id: "q1", number: "Q-1", status: "sent", issueDate: ago(20), validUntil: ahead(1), totals: { grandTotal: 3000 }, customer: { company: "Exp Co" } },
    { id: "q2", number: "Q-2", status: "sent", issueDate: ago(10), validUntil: ahead(20), totals: { grandTotal: 2000 }, customer: { company: "Chase Co" } },
    { id: "q3", number: "Q-3", status: "sent", issueDate: ago(2), validUntil: ahead(20), totals: { grandTotal: 2000 }, customer: { company: "Fresh Co" } },
  ]
  const items = attentionItems({ invoices, payments, enquiries, quotations }, undefined, NOW)
  const ids = items.map((i) => i.id)

  it("flags overdue and soon-due invoices, never paid or comfortable ones", () => {
    expect(ids).toContain("inv-i1")
    expect(ids).toContain("due-i2")
    expect(ids.some((id) => id.endsWith("i3") || id.endsWith("i4"))).toBe(false)
  })

  it("counts one Anu conversation once, however many captures it saved", () => {
    expect(items.filter((i) => i.id.startsWith("call-"))).toHaveLength(1)
  })

  it("keeps new web enquiries and skips contacted ones", () => {
    expect(ids).toContain("enq-e1")
    expect(ids).not.toContain("enq-e2")
  })

  it("chases expiring and stale quotations, not fresh ones", () => {
    expect(ids).toContain("exp-q1")
    expect(ids).toContain("chase-q2")
    expect(ids.some((id) => id.endsWith("q3"))).toBe(false)
  })

  it("puts the most urgent first: 40 days late outranks everything", () => {
    expect(items[0].id).toBe("inv-i1")
  })

  it("respects module access", () => {
    const only = attentionItems({ invoices, payments, enquiries, quotations }, { quotations: true }, NOW)
    expect(only.every((i) => i.group === "quotes")).toBe(true)
  })
})

describe("computeToday", () => {
  const data = {
    payments: [
      { id: "a", type: "inflow", amount: 1000, date: ago(5) },
      { id: "b", type: "inflow", amount: 500, date: ago(35) },
      { id: "c", type: "payout", amount: 9999, date: ago(5) },
    ],
    invoices: [
      { id: "i1", status: "sent", issueDate: ago(10), dueDate: ago(45), totals: { taxable: 800, grandTotal: 944 } },
      { id: "i2", status: "cancelled", issueDate: ago(10), totals: { taxable: 5000, grandTotal: 5900 } },
    ],
    quotations: [
      { id: "q1", status: "accepted", issueDate: ago(3), totals: { grandTotal: 2000 } },
      { id: "q2", status: "rejected", issueDate: ago(4), totals: { grandTotal: 1000 } },
      { id: "q3", status: "sent", issueDate: ago(20), totals: { grandTotal: 1500 } },
      { id: "q4", status: "accepted", issueDate: ago(40), totals: { grandTotal: 700 } },
    ],
    enquiries: [
      { id: "e1", source: "Phone", status: "new", createdAt: ago(2) },
      { id: "e2", source: "Phone", status: "new", createdAt: ago(40) },
    ],
  }
  const t = computeToday(data, "30d", NOW)

  it("compares cash with the previous window of the same length, ignoring payouts", () => {
    expect(t.cash.value).toBe(1000)
    expect(t.cash.prev).toBe(500)
    expect(t.cash.delta.pct).toBe(100)
  })

  it("draws the pace line as a running total, one point per day", () => {
    expect(t.cash.pace.current).toHaveLength(30)
    expect(t.cash.pace.current.at(-1)).toBe(1000)
    expect(t.cash.pace.previous.at(-1)).toBe(500)
  })

  it("excludes cancelled invoices from revenue and receivables", () => {
    expect(t.revenue.value).toBe(800)
    expect(t.outstanding).toBe(944)
    expect(t.overdue).toBe(944)
    expect(t.receivables.find((b) => b.key === "31-60").count).toBe(1)
  })

  it("scores win rate on decided quotations and the change in points", () => {
    expect(t.winRate.pct).toBe(50)
    expect(t.winRate.prevPct).toBe(100)
    expect(t.winRate.diff).toBe(-50)
  })

  it("ages open quotations from their issue date", () => {
    expect(t.openQuotes.count).toBe(1)
    expect(t.quoteAging.find((b) => b.key === "16-30").value).toBe(1500)
  })

  it("counts leads in the window", () => {
    expect(t.leads.value).toBe(1)
    expect(t.leads.prev).toBe(1)
  })
})
