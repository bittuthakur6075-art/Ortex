import { describe, expect, it } from "vitest"
import { formatDate } from "./format"
import { firstName, hasPhone, quotationFileName, quotationShareMessage, telLink, validUntilOf, whatsappLink } from "./quotationShare"

const settings = { company: { name: "Ortex Industries" } }
const quote = {
  number: "QT-0042",
  customer: { name: "Ravi Kumar", company: "Acme Pvt Ltd", phone: "98765 43210" },
  totals: { grandTotal: 123456.5 },
  issueDate: "2026-09-10T00:00:00.000Z",
  validUntil: "2026-09-25T00:00:00.000Z",
}
const now = new Date("2026-09-14T10:00:00.000Z").getTime()

describe("quotation share message", () => {
  it("greets by first name and states number, company, Indian-format total and validity", () => {
    const m = quotationShareMessage(quote, settings, { now })
    // The date goes through lib/format like every printed date (ICU spells the
    // month "Sep" or "Sept" depending on the runtime).
    expect(m).toBe(
      `Hello Ravi, here is quotation QT-0042 from Ortex Industries for ₹1,23,456.50 including GST, valid until ${formatDate(quote.validUntil)}. Please let us know if you have any questions.`,
    )
  })

  it("falls back to a plain greeting and drops missing parts", () => {
    const m = quotationShareMessage({ ...quote, customer: { company: "Acme" }, validUntil: null, issueDate: null }, {}, { now })
    expect(m).toBe("Hello, here is quotation QT-0042 for ₹1,23,456.50 including GST. Please let us know if you have any questions.")
  })

  it("leaves out a validity date that has already passed", () => {
    const m = quotationShareMessage({ ...quote, validUntil: "2026-09-01T00:00:00.000Z" }, settings, { now })
    expect(m).not.toContain("valid until")
  })

  it("never uses an em or en dash", () => {
    expect(quotationShareMessage(quote, settings, { now })).not.toMatch(/[–—]/)
  })

  it("derives validity from issue date + days when not stored", () => {
    expect(validUntilOf({ issueDate: "2026-09-10T00:00:00.000Z", validityDays: 15 })).toBe("2026-09-25T00:00:00.000Z")
    expect(validUntilOf({})).toBeNull()
  })

  it("takes the first word of a name", () => {
    expect(firstName("  Priya  Shah ")).toBe("Priya")
    expect(firstName("")).toBe("")
  })
})

describe("contact links", () => {
  it("adds India's code to a bare mobile and encodes the text", () => {
    expect(whatsappLink("98765 43210", "Hi there")).toBe("https://wa.me/919876543210?text=Hi%20there")
    expect(whatsappLink("09876543210")).toBe("https://wa.me/919876543210")
    expect(telLink("+91 98765 43210")).toBe("tel:+919876543210")
  })

  it("gives no link without a usable number", () => {
    expect(hasPhone("")).toBe(false)
    expect(hasPhone("12345")).toBe(false)
    expect(whatsappLink("", "x")).toBe("")
    expect(telLink(null)).toBe("")
  })

  it("names the file after the quotation", () => {
    expect(quotationFileName(quote)).toBe("Quotation-QT-0042.pdf")
    expect(quotationFileName({})).toBe("Quotation-draft.pdf")
  })
})
