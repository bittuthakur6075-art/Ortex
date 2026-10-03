import { describe, it, expect } from "vitest"
import { averageDiscount, buildQuoteRow, placeOf, readyItems, taxBases } from "./model"

const now = new Date("2026-09-27T11:00:00+05:30").getTime()
const base = { id: "q1", number: "QT-1", status: "sent", issueDate: "2026-09-20T00:00:00Z", validUntil: "2026-10-05T00:00:00Z", totals: { grandTotal: 29736 } }

describe("buildQuoteRow", () => {
  it("a console quotation: place from the address, items summary", () => {
    const r = buildQuoteRow(
      { ...base, customer: { name: "Karan", company: "StartupX", address: "Nehru Place, New Delhi, 110019", stateCode: "07" }, lines: [{ description: "Acrylic standee", quantity: 120, unit: "pcs" }, { description: "Pens", quantity: 100, unit: "pcs" }] },
      { now },
    )
    expect(r.customer).toBe("StartupX")
    expect(r.contact).toBe("Karan")
    expect(r.place).toBe("New Delhi")
    expect(r.firstItem).toBe("Acrylic standee")
    expect(r.itemsSub).toBe("+1 more · 220 pcs")
    expect(r.total).toBe(29736)
    expect(r.st).toBe("sent")
  })

  it("a phone-app quotation with no address falls back to the GST state", () => {
    const r = buildQuoteRow({ ...base, customer: { name: "Meera", stateCode: "27" }, lines: [{ description: "Badges", quantity: 150 }] }, { now })
    expect(r.customer).toBe("Meera")
    expect(r.contact).toBe("")
    expect(r.place).toBe("Maharashtra")
    expect(r.itemsSub).toBe("150 pcs")
  })

  it("mixed units, the source lead and the invoice are linked", () => {
    const r = buildQuoteRow(
      { ...base, status: "invoiced", enquiryId: "e1", invoiceId: "i1", customer: { company: "Acme", city: "Pune" }, lines: [{ description: "Kits", quantity: 10, unit: "sets" }, { description: "Pens", quantity: 10, unit: "pcs" }] },
      { now, enquiries: [{ id: "e1", reference: "ORT-1" }], invoices: [{ id: "i1", number: "INV-9" }] },
    )
    expect(r.place).toBe("Pune")
    expect(r.itemsSub).toBe("+1 more · 20 units")
    expect(r.lead.reference).toBe("ORT-1")
    expect(r.inv.number).toBe("INV-9")
    expect(r.open).toBe(false)
  })

  it("a blank draft does not break", () => {
    const r = buildQuoteRow({ id: "q2", status: "draft", lines: [{ description: "", quantity: 0 }] }, { now })
    expect(r.customer).toBe("")
    expect(r.itemsSub).toBe("No lines yet")
    expect(r.total).toBe(0)
  })
})

describe("placeOf", () => {
  it("skips a bare PIN code", () => {
    expect(placeOf({ address: "RMZ Futura, Hitech City, Hyderabad\n500081" })).toBe("Hyderabad")
  })
})

describe("taxBases and averageDiscount", () => {
  it("spreads the extra discount over the base of each rate", async () => {
    const { computeDocument } = await import("../../lib/pricing")
    const t = computeDocument(
      [
        { quantity: 150, rate: 420, discountPercent: 6, gstRate: 18 },
        { quantity: 150, rate: 380, discountPercent: 0, gstRate: 18 },
        { quantity: 150, rate: 215, discountPercent: 0, gstRate: 12 },
      ],
      { interState: true, extraDiscountPercent: 2 },
    )
    const b = taxBases(t)
    expect(b["18"]).toBeCloseTo(113895.6, 1)
    expect(b["12"]).toBeCloseTo(31605, 1)
    expect(b["18"] + b["12"]).toBeCloseTo(t.taxable, 1)
    expect(averageDiscount(t)).toBe(4.4)
  })
  it("nothing to divide", () => {
    expect(taxBases({ lines: [], taxable: 0 })).toEqual({})
    expect(averageDiscount({ subTotal: 0 })).toBe(0)
  })
})

describe("readyItems", () => {
  const lines = [{ hsn: "4819", gstRate: 18, discountPercent: 6 }, { hsn: "", gstRate: 18, discountPercent: 0 }]
  const checks = [
    { key: "customer", ok: false, text: "Customer named" },
    { key: "hsn", ok: false, text: "HSN and GST rate on every line" },
    { key: "bank", ok: true, text: "Bank or UPI details on the document" },
    { key: "discount", ok: false, warn: true, text: "discount above your 5% guide" },
  ]
  it("errors first, then checks pointing at their field, then warnings", () => {
    const items = readyItems({ checks, errors: { "customer.name": "Enter the customer's name" }, warnings: { "lines.1.quantity": "Below the minimum order of 200" }, lines, guide: 5 })
    expect(items.map((i) => i.key)).toEqual(["e:customer.name", "hsn", "bank", "discount", "w:lines.1.quantity"])
    expect(items[1]).toMatchObject({ tone: "bad", path: "lines.1.hsn", act: "Fix" })
    expect(items[2]).toMatchObject({ tone: "ok", path: null, act: null })
    expect(items[3]).toMatchObject({ tone: "warn", path: "lines.0.discountPercent", act: "Review" })
    expect(items[4].text).toBe("Line 2: Below the minimum order of 200")
  })
})
