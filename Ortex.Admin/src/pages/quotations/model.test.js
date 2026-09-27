import { describe, it, expect } from "vitest"
import { buildQuoteRow, placeOf } from "./model"

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
