import { describe, expect, it } from "vitest"
import { accessFor, buildFeed } from "./notifications"
import { VOICE_SOURCE } from "../pages/voice-leads/helpers"

const NOW = new Date("2026-09-12T10:00:00.000Z").getTime()
const DAY = 86400000
const ago = (days) => new Date(NOW - days * DAY).toISOString()

const customer = (over = {}) => ({ name: "Ravi Kumar", company: "", phone: "9876543210", address: "Jaipur, Rajasthan", ...over })
const enquiry = (over = {}) => ({
  id: "e1",
  createdAt: ago(0),
  customer: customer(),
  source: "Website form",
  productInterest: "MDF name boards",
  message: "",
  status: "new",
  ...over,
})
const voiceRow = (over = {}) => enquiry({ source: VOICE_SOURCE, message: "Wants lanyards · Qty: 500 · Timeline: next week", ...over })

const build = (data, access) => buildFeed(data, { now: NOW, ...(access ? { access } : {}) })
const text = (n) => n.title.map((p) => (typeof p === "string" ? p : p.b)).join("")

describe("enquiry signals", () => {
  it("keeps the existing new-enquiry id and opens the record", () => {
    const [n] = build({ enquiries: [enquiry()] })
    expect(n.id).toBe("enq-new-e1")
    expect(n.kind).toBe("enquiry-new")
    expect(n.primary.to).toBe("/enquiries/e1")
    expect(text(n)).toMatch(/Ravi Kumar sent a new enquiry for MDF name boards/)
  })

  it("does not call an enquiry cold before two days", () => {
    const feed = build({ enquiries: [enquiry({ createdAt: ago(1.9) })] })
    expect(feed.map((n) => n.kind)).toEqual(["enquiry-new"])
  })

  it("asks again, urgently, once it is still new after two days", () => {
    const feed = build({ enquiries: [enquiry({ createdAt: ago(3) })] })
    const stale = feed.find((n) => n.kind === "enquiry-stale")
    expect(stale).toBeTruthy()
    expect(stale.urgent).toBe(true)
    expect(stale.tone).toBe("amber")
    expect(text(stale)).toMatch(/3 days ago/)
    // The day count is in the id, so tomorrow it is a fresh unread notification.
    const tomorrow = buildFeed({ enquiries: [enquiry({ createdAt: ago(3) })] }, { now: NOW + DAY }).find((n) => n.kind === "enquiry-stale")
    expect(tomorrow.id).not.toBe(stale.id)
  })

  it("drops answered and fortnight-old enquiries", () => {
    expect(build({ enquiries: [enquiry({ status: "quoted" })] })).toHaveLength(0)
    expect(build({ enquiries: [enquiry({ createdAt: ago(20) })] })).toHaveLength(0)
  })
})

describe("voice signals", () => {
  it("folds three captures of one call into ONE notification and never repeats them as enquiries", () => {
    const rows = ["v1", "v2", "v3"].map((id, i) => voiceRow({ id, createdAt: new Date(NOW - (10 - i) * 60000).toISOString() }))
    const feed = build({ enquiries: rows })
    expect(feed).toHaveLength(1)
    expect(feed[0].id).toBe("voice-new-v3")
    expect(feed[0].kind).toBe("voice-new")
    expect(feed[0].primary).toEqual({ label: "Open call", to: "/crm?tab=voice", state: { openId: "v3" } })
    expect(feed[0].tags).toContain("3 captures")
    expect(feed[0].detail).toMatch(/^500 x MDF name boards · /)
    expect(feed[0].detail).toMatch(/\+91 98765 43210/)
  })

  it("flags a complaint as support in rose and puts it first", () => {
    const feed = build({
      enquiries: [
        enquiry({ id: "w1", createdAt: ago(0) }),
        voiceRow({ id: "v9", createdAt: ago(1), customer: customer({ phone: "9000000001" }), message: "Wants to cancel the order, very angry about the delay" }),
      ],
    })
    expect(feed[0].id).toBe("voice-support-v9")
    expect(feed[0].kind).toBe("voice-support")
    expect(feed[0].tone).toBe("rose")
    expect(feed[0].urgent).toBe(true)
    expect(feed[0].detail).toMatch(/^Support, not a sale\./)
  })

  it("drops a contacted call and one older than the window", () => {
    expect(build({ enquiries: [voiceRow({ status: "contacted" })] })).toHaveLength(0)
    expect(build({ enquiries: [voiceRow({ createdAt: ago(15) })] })).toHaveLength(0)
  })
})

describe("access", () => {
  const data = {
    enquiries: [enquiry(), voiceRow({ id: "v1", customer: customer({ phone: "9000000002" }) })],
    quotations: [{ id: "q1", number: "QTN-1", status: "sent", validUntil: ago(-1), customer: customer(), totals: { grandTotal: 100 } }],
  }

  it("shows each signal only to a profile that can open it", () => {
    // Staff: a role that grants nothing by default, so the one extra is all
    // they can open (a Sales Executive now gets their role's grants as well).
    const voiceOnly = accessFor({ role: "staff", modules: ["voice-leads"] })
    expect(build(data, voiceOnly).map((n) => n.kind)).toEqual(["voice-new"])
    const enquiriesOnly = accessFor({ role: "staff", modules: ["enquiries"] })
    expect(build(data, enquiriesOnly).map((n) => n.kind)).toEqual(["enquiry-new"])
    expect(build(data, accessFor({ role: "admin" })).map((n) => n.kind).sort()).toEqual(["enquiry-new", "quotation-expiring", "voice-new"])
    expect(build(data, accessFor({ role: "super_admin" })).map((n) => n.kind).sort()).toEqual(["enquiry-new", "quotation-expiring", "voice-new"])
    // The role's grants count as much as the person's own ticks.
    const salesByRole = accessFor({ role: "sales", modules: [], roleModules: ["enquiries"] })
    expect(build(data, salesByRole).map((n) => n.kind)).toEqual(["enquiry-new"])
  })

  it("shows nothing before the profile has loaded", () => {
    expect(build(data, accessFor(null))).toHaveLength(0)
  })
})

describe("existing signal ids stay stable", () => {
  it("keeps the ids read/archived flags are stored under", () => {
    const feed = build({
      leads: [{ id: "l1", stage: "new", nextFollowUp: "2026-09-10", customer: customer() }],
      quotations: [{ id: "q1", number: "QTN-1", status: "sent", validUntil: "2026-09-13", customer: customer(), totals: { grandTotal: 100 } }],
      invoices: [{ id: "i1", number: "INV-1", status: "overdue", dueDate: "2026-09-01", customer: customer(), totals: { grandTotal: 100 } }],
      payments: [{ id: "p1", type: "inflow", date: ago(1), amount: 50, party: "Ravi" }],
    })
    expect(feed.map((n) => n.id).sort()).toEqual(["inv-due-i1-2026-09-01", "lead-fu-l1-2026-09-10", "pay-in-p1", "qtn-exp-q1-2026-09-13"])
  })
})
