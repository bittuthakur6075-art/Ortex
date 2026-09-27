import { describe, it, expect } from "vitest"
import { sheetToEnquiries, parseDate, parseQuantity, parsePhone, mapStatus } from "./enquiryImport"

const HEADER = ["", "Name ", "Mobile No.", "Status", "Mobile No.2", " Type of Product", "Quantity", "Rate", "City", "company Name", "Email id", ""]
const today = new Date("2026-09-27T12:00:00Z")

describe("enquiryImport", () => {
  it("reads the call-log sheet", () => {
    const rows = [
      HEADER,
      ["", "Before Date", 9307904816, "", "waiting for call", "Acrylic", "4l", "", "Beed", "", "", ""],
      ["21/12/2025", "Narendra", "+91 72404 44040", "order received", 9876543210, "Wrist band", "1,500", "6.5", "Mahwa", "Hardik", "N@X.IN", "spec here"],
      [45683, "Swapped", 9811599339, "price given waiting for order", "", "Keychain", "Missed call", "", "Palam", "", "no email", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
    ]
    const { enquiries, skipped, columns } = sheetToEnquiries(rows, { fileName: "log.xlsx", today })
    expect(columns).toMatchObject({ date: 0, name: 1, phone: 2, status: 3, phone2: 4, product: 5, quantity: 6, rate: 7, city: 8, company: 9, email: 10 })
    expect(skipped).toEqual([])
    expect(enquiries).toHaveLength(3)

    const [a, b, c] = enquiries
    expect(a.createdAt).toBe("2025-12-21T10:00:00+05:30") // filled from the first dated row
    expect(a.quantity).toBe("400000")
    expect(a.notes).toBe("Note: waiting for call")
    expect(a.status).toBe("contacted") // the note column counts too

    expect(b.customer).toMatchObject({ phone: "7240444040", email: "n@x.in", company: "Hardik", city: "Mahwa" })
    expect(b.altPhone).toBe("9876543210")
    expect(b).toMatchObject({ quantity: "1500", rate: "6.5", status: "won", imported: { file: "log.xlsx", row: 3 } })
    expect(b.notes).toContain("spec here")

    // 45683 is 25 Jan 2025 as Excel read it; the log says it follows 21 Dec 2025,
    // so it is a typo and keeps the previous date.
    expect(c.createdAt).toBe("2025-12-21T10:00:00+05:30")
    expect(c.status).toBe("qualified")
    expect(c.quantity).toBe("")
    expect(c.notes).toContain("Quantity column: Missed call")
    expect(c.notes).toContain("Email column: no email")
  })

  it("skips what is already in the console, and repeats in the file", () => {
    const row = ["01/02/2026", "Asha", 9000000001, "", "", "Badge", 100, "", "", "", "", ""]
    const first = sheetToEnquiries([HEADER, row, row], { today })
    expect(first.enquiries).toHaveLength(1)
    expect(first.skipped).toMatchObject([{ row: 3, reason: "Repeated in this file", name: "Asha", since: "row 2" }])
    const again = sheetToEnquiries([HEADER, row], { today, existing: first.enquiries })
    expect(again.enquiries).toHaveLength(0)
    expect(again.skipped).toMatchObject([{ row: 2, reason: "Already in the console", phone: "9000000001", product: "Badge" }])
  })

  it("recognises a re-import however the lead came back from the database", () => {
    const undatedFirst = ["", "Ravi", 9000000002, "", "", "Pen", "", "", "", "", "", ""]
    const dated = ["03/02/2026", "Mona", 9000000003, "", "", "Mug", "", "", "", "", "", ""]
    const first = sheetToEnquiries([HEADER, undatedFirst, dated], { today })
    // Saved rows come back with created_at in UTC.
    const saved = first.enquiries.map((e) => ({ ...e, createdAt: new Date(e.createdAt).toISOString() }))
    expect(sheetToEnquiries([HEADER, undatedFirst, dated], { today, existing: saved }).enquiries).toHaveLength(0)

    // A lead saved at 01:00 IST is 19:30 UTC the day before.
    const early = [{ customer: { phone: "9000000003" }, productInterest: "Mug", createdAt: "2026-02-02T19:30:00Z" }]
    expect(sheetToEnquiries([HEADER, dated], { today, existing: early }).enquiries).toHaveLength(0)

    // A sheet with no dates at all is saved as "now": match on person and product.
    const noDates = sheetToEnquiries([HEADER, undatedFirst], { today, existing: [{ customer: { phone: "9000000002" }, productInterest: "Pen", createdAt: "2026-09-20T09:00:00Z" }] })
    expect(noDates.skipped).toMatchObject([{ row: 2, reason: "Already in the console", since: "2026-09-20T09:00:00Z" }])
  })

  it("keeps people without a mobile apart, and flags a mobile that is already a lead", () => {
    const a = ["01/02/2026", "Ravi", "", "", "", "Lanyards", "", "", "", "", "", ""]
    const b = ["", "Sunil", "", "", "", "Lanyards", "", "", "", "", "", ""]
    const c = ["", "Priya", 9000000004, "", "", "Badge", "", "", "", "", "", ""]
    const existing = [{ customer: { name: "Priya N", phone: "+91 90000 00004" }, productInterest: "Keychain", createdAt: "2026-01-10T05:00:00Z" }]
    const r = sheetToEnquiries([HEADER, a, b, c], { today, existing })
    expect(r.enquiries).toHaveLength(3)
    expect(r.repeats).toEqual([{ row: 4, name: "Priya N" }])
  })

  it("refuses a sheet without Name and Mobile headers", () => {
    expect(sheetToEnquiries([["a", "b"], [1, 2]]).error).toMatch(/header/)
  })

  it("parses the pieces", () => {
    expect(parseDate("5/1/26", null, today)).toBe("2026-01-05")
    expect(parseDate("20/01/2016", null, today)).toBe(null)
    expect(parseDate("27/062026", null, today)).toBe(null)
    expect(parseQuantity("2.5k")).toBe(2500)
    expect(parseQuantity("2000+")).toBe(2000)
    expect(parseQuantity("3K-4K")).toBe(null)
    expect(parsePhone("096599056431")).toBe(null)
    expect(parsePhone("09811599339")).toBe("9811599339")
    expect(mapStatus("Already given order to other")).toBe("lost")
    expect(mapStatus("call not picked")).toBe("contacted")
    expect(mapStatus("price given")).toBe("quoted")
  })
})
