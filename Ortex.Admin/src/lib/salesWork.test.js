import { describe, it, expect } from "vitest"
import { leadNextStep, leadGroup, dueLabel, quoteFollowUp, quoteStatus, validityLeft, leadFlags, quoteChecks, snoozePresets, DAY, HOUR } from "./salesWork"

const now = new Date("2026-09-27T11:00:00+05:30").getTime()
const iso = (t) => new Date(t).toISOString()

describe("leadNextStep", () => {
  it("a new website lead three days old is a first call, overdue", () => {
    const s = leadNextStep({ status: "new", source: "Website contact form", createdAt: iso(now - 3 * DAY) }, now)
    expect(s.label).toBe("First call")
    expect(leadGroup(s)).toBe("overdue")
    expect(dueLabel(s.due, now)).toBe("Overdue 3 days")
  })

  it("an Anu call is a call back, a complaint goes to accounts", () => {
    expect(leadNextStep({ status: "new", source: "Voice assistant (Anu)", createdAt: iso(now) }, now).label).toBe("Call back (Anu call)")
    expect(leadNextStep({ status: "new", message: "damaged keychains, want a refund", createdAt: iso(now) }, now).label).toBe("Hand to accounts")
  })

  it("a person's follow-up date wins over the derived one", () => {
    const s = leadNextStep({ status: "new", createdAt: iso(now - 5 * DAY), followUpAt: iso(now + DAY) }, now)
    expect(leadGroup(s)).toBe("upcoming")
    expect(dueLabel(s.due, now)).toBe("Tomorrow")
  })

  it("contacted without a real quantity asks for it", () => {
    expect(leadNextStep({ status: "contacted", updatedAt: iso(now) }, now).label).toBe("Ask for quantity")
    expect(leadNextStep({ status: "contacted", quantity: "2 crore", updatedAt: iso(now) }, now).label).toBe("Confirm real quantity")
    expect(leadNextStep({ status: "contacted", quantity: "500", updatedAt: iso(now) }, now).label).toBe("Send quotation")
  })

  it("won and lost leads have no next step", () => {
    expect(leadNextStep({ status: "won" }, now)).toBe(null)
    expect(leadGroup(null)).toBe("closed")
  })

  it("flags a non-numeric quantity for checking", () => {
    expect(leadFlags({ quantity: "3K-4K" }).verifyQty).toBe(true)
    expect(leadFlags({ quantity: "1,800" }).verifyQty).toBe(false)
  })
})

describe("dueLabel", () => {
  it("counts hours on the same day", () => {
    expect(dueLabel(now - 5 * HOUR - 1, now)).toBe("Overdue 5 hours")
  })
})

describe("quotations", () => {
  it("a draft needs sending", () => {
    expect(quoteFollowUp({ status: "draft", createdAt: iso(now) }, now)).toMatchObject({ group: "needs", action: "send" })
  })

  it("a sent quote waits three days, then needs a follow-up", () => {
    expect(quoteFollowUp({ status: "sent", issueDate: iso(now - DAY), validUntil: iso(now + 10 * DAY) }, now).group).toBe("waiting")
    const late = quoteFollowUp({ status: "sent", issueDate: iso(now - 4 * DAY), validUntil: iso(now + 10 * DAY) }, now)
    expect(late).toMatchObject({ group: "needs", label: "Overdue 1 day" })
  })

  it("a sent quote past its validity reads expired and closed", () => {
    const q = { status: "sent", issueDate: iso(now - 20 * DAY), validUntil: iso(now - 2 * DAY) }
    expect(quoteStatus(q, now)).toBe("expired")
    expect(validityLeft(q, now)).toBe(-2)
    expect(quoteFollowUp(q, now).group).toBe("closed")
  })

  it("accepted means bill it", () => {
    expect(quoteFollowUp({ status: "accepted" }, now)).toMatchObject({ group: "needs", action: "invoice" })
  })
})

describe("quoteChecks", () => {
  const settings = { company: { bankAccount: "1", bankIfsc: "HDFC0001" }, quotation: { discountGuidePct: 5 } }
  it("passes a complete quotation", () => {
    const q = { customer: { name: "Kavya", stateCode: "36" }, lines: [{ description: "Kit", quantity: 1, hsn: "4819", gstRate: 18 }], validUntil: iso(now + DAY) }
    expect(quoteChecks(q, settings, now).every((c) => c.ok)).toBe(true)
  })
  it("flags a missing HSN, a big discount and lapsed validity", () => {
    const q = { customer: { name: "Kavya" }, lines: [{ description: "Kit box, kraft", quantity: 1, gstRate: 18, discountPercent: 6 }], validUntil: iso(now - 2 * DAY) }
    const bad = quoteChecks(q, settings, now).filter((c) => !c.ok).map((c) => c.key)
    expect(bad).toEqual(["gst", "hsn", "discount", "validity"])
  })
})

describe("snoozePresets", () => {
  it("offers later today in the morning, every preset in the future", () => {
    const t = new Date(2026, 8, 27, 11, 20).getTime()
    const p = snoozePresets(t)
    expect(p.map((x) => x.key)).toEqual(["later", "tomorrow", "3days", "week"])
    expect(new Date(p[0].at).getHours()).toBe(14)
    expect(p.every((x) => new Date(x.at).getTime() > t)).toBe(true)
  })

  it("drops later today when three hours on is tomorrow", () => {
    const t = new Date(2026, 8, 27, 22, 0).getTime()
    expect(snoozePresets(t).map((x) => x.key)).toEqual(["tomorrow", "3days", "week"])
  })
})
