// Insights → Sales. Every fixture is dated relative to a fixed `now`, so the
// suite gives the same answer on any day it runs.

import { describe, it, expect } from "vitest"
import { computeSales, durationWords, leadHeatmap, leadsFrom, median, speedWords, VOICE_LABEL } from "./sales"
import { DAY } from "./today"
import { VOICE_SOURCE } from "../../pages/voice-leads/helpers"

const NOW = new Date("2026-09-14T12:00:00").getTime()
const HOUR = 3600000
const at = (t) => new Date(t).toISOString()
const ago = (days, hours = 0) => at(NOW - days * DAY - hours * HOUR)

const enquiries = [
  // web, this window
  { id: "e1", source: "Website contact form", status: "quoted", createdAt: ago(2), customer: { company: "Acme" } },
  { id: "e2", source: "Website contact form", status: "new", createdAt: ago(3), customer: { name: "Asha" } },
  { id: "e3", source: "IndiaMART", status: "won", createdAt: ago(5), customer: { company: "Beta" } },
  // previous window
  { id: "e4", source: "IndiaMART", status: "quoted", createdAt: ago(40), customer: { company: "Old Co" } },
  // one Anu call, two captures ten minutes apart
  { id: "v1", source: VOICE_SOURCE, status: "new", createdAt: ago(1), message: "Wants 200 lanyards", customer: { name: "Ravi", phone: "9876543210" } },
  { id: "v2", source: VOICE_SOURCE, status: "new", createdAt: at(NOW - DAY - 10 * 60000), message: "Wants lanyards", customer: { name: "Ravi", phone: "9876543210" } },
]

const quotations = [
  // e1 quoted 4h after it arrived, accepted; linked through enquiryId
  {
    id: "q1", status: "accepted", enquiryId: "e1", createdAt: ago(2, -4), issueDate: ago(2, -4),
    customer: { company: "Acme" }, totals: { grandTotal: 11800, lines: [{ taxable: 8000 }, { taxable: 2000 }] },
    lines: [{ productId: "p1", description: "Acrylic keychain\nlogo print", quantity: 400, rate: 20 }, { description: "Lanyard", quantity: 100, rate: 20 }],
  },
  // linked to the SECOND capture of the Anu call: it still counts for the call
  {
    id: "q2", status: "rejected", enquiryId: "v2", createdAt: ago(0, 12), issueDate: ago(0, 12), lostReason: "Price too high",
    customer: { company: "Ravi Traders" }, totals: { grandTotal: 5900, lines: [{ taxable: 5000 }] },
    lines: [{ productId: "p1", description: "Acrylic keychain", quantity: 250, rate: 20 }],
  },
  { id: "q3", status: "rejected", createdAt: ago(6), issueDate: ago(6), customer: { company: "Acme" }, totals: { grandTotal: 1000 }, lines: [] },
  { id: "q4", status: "draft", createdAt: ago(1), issueDate: ago(1), customer: { company: "Gamma" }, totals: { grandTotal: 3000 } },
  // previous window: quoted 48h after e4
  { id: "q5", status: "accepted", enquiryId: "e4", createdAt: ago(38), issueDate: ago(38), customer: { company: "Old Co" }, totals: { grandTotal: 2000 } },
  { id: "q6", status: "invoiced", enquiryId: "e3", createdAt: ago(4), customer: { company: "Beta" }, totals: { grandTotal: 4000 } },
]

describe("leadsFrom", () => {
  it("folds Anu captures into one call and keeps every row id", () => {
    const leads = leadsFrom(enquiries)
    const voice = leads.filter((l) => l.kind === "voice")
    expect(voice).toHaveLength(1)
    expect(voice[0].source).toBe(VOICE_LABEL)
    expect(voice[0].rowIds.sort()).toEqual(["v1", "v2"])
    expect(leads).toHaveLength(5)
  })
})

describe("computeSales (30 days)", () => {
  const s = computeSales({ enquiries, quotations }, "30d", NOW)

  it("counts leads with the call once, against the previous window", () => {
    expect(s.leads.total).toBe(4)
    expect(s.leads.prev).toBe(1)
    expect(s.uncontacted).toBe(2)
  })

  it("ranks sources for the period, with conversion through a linked quotation", () => {
    const web = s.sources.find((x) => x.label === "Website contact form")
    expect(web).toMatchObject({ count: 2, won: 1, conv: 50 })
    expect(s.sources.find((x) => x.label === "IndiaMART")).toMatchObject({ count: 1, won: 1 })
    expect(s.sources.find((x) => x.label === VOICE_LABEL)).toMatchObject({ count: 1, won: 0, conv: 0 })
  })

  it("leaves drafts out of quoted, win rate and average", () => {
    expect(s.quoted.count).toBe(4)
    expect(s.quoted.value).toBe(22700)
    expect(s.winRate).toMatchObject({ pct: 50, won: 2, decided: 4, prevPct: 100 })
    expect(s.avgQuote.value).toBe(5675)
    expect(s.avgQuote.prev).toBe(2000)
  })

  it("dates a quotation by issueDate, falling back to createdAt", () => {
    expect(s.topCustomers.find((c) => c.name === "Beta")).toMatchObject({ value: 4000, wonValue: 4000 })
  })

  it("ranks products by ex-GST line value, merging by productId", () => {
    expect(s.topProducts[0]).toEqual({ name: "Acrylic keychain", value: 13000, quantity: 650, quotes: 2 })
    expect(s.topProducts[1]).toMatchObject({ name: "Lanyard", value: 2000, quantity: 100 })
  })

  it("ranks customers by quoted value with the won part", () => {
    expect(s.topCustomers[0]).toEqual({ name: "Acme", value: 12800, quotes: 2, wonValue: 11800 })
  })

  it("lists lost reasons including the unrecorded ones", () => {
    expect(s.lostReasons).toEqual(
      expect.arrayContaining([{ reason: "Price too high", count: 1 }, { reason: "No reason recorded", count: 1 }]),
    )
  })

  it("takes the median lead-to-first-quote time, per window", () => {
    // e1: 4h, the call: 12h after it began, e3: 24h → median 12h; previous: 48h
    expect(s.timeToQuote.samples).toBe(3)
    expect(s.timeToQuote.hours).toBeCloseTo(12.17, 1)
    expect(s.timeToQuote.prevHours).toBe(48)
  })

  it("mixes status by value with drafts, in a fixed order", () => {
    expect(s.statusMix.map((m) => m.id)).toEqual(["draft", "accepted", "invoiced", "rejected"])
    expect(s.statusMix.find((m) => m.id === "rejected")).toEqual({ id: "rejected", count: 2, value: 6900 })
  })
})

describe("computeSales (7 days)", () => {
  it("narrows every figure to the window", () => {
    const s = computeSales({ enquiries, quotations }, "7d", NOW)
    expect(s.days).toBe(7)
    expect(s.leads.total).toBe(4)
    expect(s.leads.prev).toBe(0)
    expect(s.avgQuote.delta.pct).toBeNull()
  })
})

describe("leadHeatmap", () => {
  it("buckets by local weekday and time band, and names the peak", () => {
    const mon10 = new Date("2026-09-14T10:30:00").getTime() // a Monday
    const leads = [
      { at: mon10 },
      { at: mon10 - 7 * DAY },
      { at: new Date("2026-09-13T07:00:00").getTime() }, // Sunday 7am → Sunday, Night
      { at: NOW - 100 * DAY }, // outside 90 days
    ]
    const h = leadHeatmap(leads, NOW)
    expect(h.total).toBe(3)
    expect(h.cells[0][0]).toBe(2)
    expect(h.cells[6][4]).toBe(1)
    expect(h.peak).toEqual({ day: "Mon", band: "9–12", count: 2 })
  })

  it("has no peak without leads", () => {
    expect(leadHeatmap([], NOW).peak).toBeNull()
  })
})

describe("words", () => {
  it("medians odd and even lists", () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("reads durations as a person would", () => {
    expect(durationWords(null)).toBe("–")
    expect(durationWords(0.25)).toBe("15 min")
    expect(durationWords(3.46)).toBe("3.5 h")
    expect(durationWords(72)).toBe("3 days")
  })

  it("states the speed comparison, faster being better", () => {
    expect(speedWords(4, 12, "the previous 30 days")).toBe("8 h faster than the previous 30 days (12 h).")
    expect(speedWords(null, 12, "x")).toMatch(/No lead/)
    expect(speedWords(4, null, "the previous 30 days")).toMatch(/Nothing to compare/)
  })
})
