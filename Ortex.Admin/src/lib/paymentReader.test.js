import { describe, it, expect } from "vitest"
import { parseAmount, referenceKind, pickReference, methodFor, parsePaidAt, normalizeReading, findDuplicate, matchInvoice, nameScore, parseReceiptText, parseReceiptDate, fixDigits, otsuThreshold, headlineAmount, mergeReadings, readingScore } from "./paymentReader"

const now = new Date("2026-10-01T12:00:00+05:30").getTime()

describe("amounts and references", () => {
  it("reads rupee amounts however they are printed", () => {
    expect(parseAmount("₹1,23,456.50")).toBe(123456.5)
    expect(parseAmount("Rs. 500")).toBe(500)
    expect(parseAmount(2500)).toBe(2500)
    expect(parseAmount("")).toBe(null)
    expect(parseAmount(0)).toBe(null)
  })

  it("knows a UTR from an RRN from an app order id", () => {
    expect(referenceKind("SBINR52026093000012345")).toBe("rtgs")
    expect(referenceKind("HDFCN52026093012")).toBe("neft")
    expect(referenceKind("4271 3456 7890")).toBe("rrn")
    expect(referenceKind("T2609301234567890123")).toBe("other")
    expect(referenceKind("12")).toBe(null)
  })

  it("keeps the bank reference over the app's own transaction id", () => {
    expect(pickReference("T2609301234567890123", ["427134567890"])).toBe("427134567890")
    expect(pickReference("", ["HDFCN52026093012", "427134567890"])).toBe("HDFCN52026093012")
  })

  it("maps the transfer to the console's methods", () => {
    expect(methodFor("UPI", "427134567890")).toBe("UPI")
    expect(methodFor("IMPS", "427134567890")).toBe("Bank transfer / NEFT")
    expect(methodFor("Other", "SBINR52026093000012345")).toBe("RTGS")
    expect(methodFor("", "427134567890")).toBe("UPI")
  })

  it("refuses a future or ancient date", () => {
    expect(parsePaidAt("2026-09-30T18:42:00+05:30", now)).toBe("2026-09-30T13:12:00.000Z")
    expect(parsePaidAt("2027-01-01", now)).toBe(null)
    expect(parsePaidAt("2019-01-01", now)).toBe(null)
    expect(parsePaidAt("yesterday", now)).toBe(null)
  })
})

describe("normalizeReading", () => {
  const gpay = {
    isPaymentProof: true,
    status: "success",
    amount: "₹11,800.00",
    currency: "INR",
    paidAt: "2026-09-30T18:42:00+05:30",
    method: "UPI",
    app: "Google Pay",
    reference: "427134567890",
    payerName: "RAHUL K SHARMA",
    payeeName: "Ortex Industries",
    note: "INV-0042",
    confidence: 0.95,
  }

  it("a clean Google Pay receipt fills the form with no warnings", () => {
    const d = normalizeReading(gpay, { now })
    expect(d).toMatchObject({ amount: 11800, method: "UPI", reference: "427134567890", party: "RAHUL K SHARMA", status: "success" })
    expect(d.note).toBe('Paid by Google Pay, remark "INV-0042"')
    expect(d.warnings).toEqual([])
  })

  it("a payout keeps the payee", () => {
    expect(normalizeReading(gpay, { type: "payout", now }).party).toBe("Ortex Industries")
  })

  it("warns on a failed, unreadable or non-payment screenshot", () => {
    const d = normalizeReading({ isPaymentProof: false, status: "failed", confidence: 0.3 }, { now })
    expect(d.warnings.join(" ")).toMatch(/does not look like/)
    expect(d.warnings.join(" ")).toMatch(/FAILED/)
    expect(d.warnings.join(" ")).toMatch(/No amount/)
    expect(d.warnings.join(" ")).toMatch(/hard to read/)
  })
})

describe("findDuplicate", () => {
  const ledger = [
    { id: "p1", type: "inflow", amount: 11800, date: "2026-09-30T13:12:00.000Z", reference: "4271 3456 7890", party: "Rahul Sharma" },
  ]

  it("the same reference is a certain duplicate, spaces or not", () => {
    expect(findDuplicate({ reference: "427134567890" }, ledger)).toMatchObject({ sure: true })
  })

  it("same amount, day and payer without a reference is a possible one", () => {
    const hit = findDuplicate({ type: "inflow", amount: 11800, date: "2026-09-30T15:00:00.000Z", party: "RAHUL K SHARMA" }, ledger)
    expect(hit).toMatchObject({ sure: false })
  })

  it("a different payment is not a duplicate", () => {
    expect(findDuplicate({ type: "inflow", amount: 500, date: "2026-09-30T15:00:00.000Z", reference: "999999999999" }, ledger)).toBe(null)
  })
})

describe("matchInvoice", () => {
  const inv = (id, number, name, total) => ({ id, number, customer: { name }, totals: { grandTotal: total } })
  const open = [
    { inv: inv("a", "INV-0042", "Rahul Sharma", 11800), balance: 11800 },
    { inv: inv("b", "INV-0043", "Neha Gupta", 11800), balance: 11800 },
    { inv: inv("c", "INV-0044", "Rahul Sharma", 5000), balance: 5000 },
  ]

  it("amount plus payer name picks the invoice", () => {
    expect(matchInvoice({ amount: 11800, party: "RAHUL K SHARMA" }, open)?.inv.id).toBe("a")
  })

  it("the invoice number in the remark wins on its own", () => {
    expect(matchInvoice({ amount: 300, party: "Someone", remark: "inv 0043" }, open)?.inv.id).toBe("b")
  })

  it("amount alone is not enough when two invoices share it", () => {
    expect(matchInvoice({ amount: 11800, party: "" }, open)).toBe(null)
  })

  it("names compare by meaningful words", () => {
    expect(nameScore("M/S SHARMA TRADERS PVT LTD", "Sharma Traders")).toBe(1)
    expect(nameScore("Rahul", "")).toBe(0)
  })
})

describe("reading the OCR text of a receipt", () => {
  const read = (text, conf) => normalizeReading(parseReceiptText(text, conf), { now })

  it("Google Pay: label and value on separate lines, ₹ read as %", () => {
    const d = read(
      `%11,800
Paid to
Ortex Industries
ortexindustries@okhdfcbank
Completed
30 Sep 2026, 6:42 pm
UPI transaction ID
4271 3456 789O
To: ORTEX INDUSTRIES
From: RAHUL K SHARMA (HDFC Bank)
rahul.sharma@okaxis
Google transaction ID
CICAgKDj5vLqZQ
Powered by UPI | Google Pay`,
      91,
    )
    expect(d).toMatchObject({ amount: 11800, reference: "427134567890", method: "UPI", party: "RAHUL K SHARMA", status: "success" })
    expect(d.date).toBe("2026-09-30T13:12:00.000Z")
    expect(d.note).toMatch(/Google Pay/)
    expect(d.warnings).toEqual([])
  })

  it("PhonePe: Rs amount, Transaction ID beside the label, remark", () => {
    const d = read(
      `Transaction Successful
02:15 pm on 29 Sep 2026
Paid to
Sharma Traders
Rs.5,000
Transaction ID: T2609291415123456789012
UTR: 427099887766
Debited from XXXXXX4321
Message: INV-0044 advance
PhonePe`,
    )
    expect(d).toMatchObject({ amount: 5000, reference: "427099887766", method: "UPI", remark: "INV-0044 advance" })
    expect(d.date).toBe("2026-09-29T08:45:00.000Z")
  })

  it("NEFT from net banking: UTR, beneficiary, day-first date", () => {
    const raw = parseReceiptText(`Funds Transfer
Your transaction was successful
Transfer Type NEFT
Amount INR 2,36,000.00
Beneficiary Name : ORTEX INDUSTRIES
Remitter Name : NEHA GUPTA
Reference No : HDFCN52026092812
Date 28/09/2026 11:05:21
Remarks: PO 7781`)
    expect(raw).toMatchObject({ amount: 236000, method: "NEFT", payerName: "NEHA GUPTA", payeeName: "ORTEX INDUSTRIES", note: "PO 7781", status: "success" })
    const d = normalizeReading(raw, { now })
    expect(d).toMatchObject({ method: "Bank transfer / NEFT", reference: "HDFCN52026092812", party: "NEHA GUPTA" })
    expect(d.date).toBe("2026-09-28T05:35:00.000Z")
  })

  it("a failed payment and a blurry image are both called out", () => {
    const d = read(`Payment failed\n₹ 1,200\nUPI Ref No 427100000001`, 45)
    expect(d.status).toBe("failed")
    expect(d.warnings.join(" ")).toMatch(/FAILED/)
    expect(d.warnings.join(" ")).toMatch(/hard to read/)
  })

  it("a photo of anything else is not a payment", () => {
    const d = read(`Lanyards 500 pcs\nBlue with logo`)
    expect(d.amount).toBe(null)
    expect(d.warnings.join(" ")).toMatch(/does not look like/)
  })

  it("dates in the other shapes apps print", () => {
    expect(parseReceiptDate("Sep 30, 2026 6:42 PM")).toBe("2026-09-30T18:42:00+05:30")
    expect(parseReceiptDate("2026-09-30 18:42:10")).toBe("2026-09-30T18:42:00+05:30")
    expect(parseReceiptDate("30th September 2026")).toBe("2026-09-30T12:00:00+05:30")
    expect(parseReceiptDate("no date here")).toBe("")
  })

  it("fixes O, I and S only inside numbers", () => {
    expect(fixDigits("4271345678O9")).toBe("427134567809")
    expect(fixDigits("HDFCN52026092812")).toBe("HDFCN52026092812")
  })
})

describe("otsuThreshold", () => {
  it("splits dark text from a light background between the two peaks", () => {
    const hist = new Array(256).fill(0)
    hist[30] = 200
    hist[220] = 800
    const t = otsuThreshold(hist)
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThan(220)
  })
})

describe("real-world fixes", () => {
  it("₹ read as a digit stuck to the headline amount", () => {
    // Broken Indian grouping: certain.
    expect(headlineAmount("311,800")).toEqual({ amount: 11800, alt: null })
    expect(headlineAmount("%11,800")).toEqual({ amount: 11800, alt: null })
    expect(headlineAmount("3,11,800")).toEqual({ amount: 311800, alt: null })
    expect(headlineAmount("11800.00")).toEqual({ amount: 11800, alt: null })
    expect(headlineAmount("9876543210")).toBe(null)
    expect(headlineAmount("Paid to")).toBe(null)
  })

  it("31,200 or 1,200: the word's confidence decides, the other stays one click away", () => {
    expect(headlineAmount("31,200", 96)).toEqual({ amount: 31200, alt: null })
    expect(headlineAmount("31,200", 82)).toEqual({ amount: 31200, alt: 1200 })
    expect(headlineAmount("31,200", 40)).toEqual({ amount: 1200, alt: 31200 })
    // 45,000 does not start with a digit ₹ turns into.
    expect(headlineAmount("45,000", 40)).toEqual({ amount: 45000, alt: null })
    const d = normalizeReading(parseReceiptText("Payment failed\n31,200\nUPI Ref No 427100000001", 90, { "31,200": 40 }), { now })
    expect(d).toMatchObject({ amount: 1200, amountAlt: 31200 })
    expect(d.warnings.join(" ")).toMatch(/₹1,200 or ₹31,200/)
  })

  it("M/S stays in a business name", () => {
    expect(parseReceiptText("Remitter Name : M/S GUPTA EXPORTS PVT LTD\n₹5,000").payerName).toBe("M/S GUPTA EXPORTS PVT LTD")
  })

  it("the payer's bank is not part of their name", () => {
    expect(parseReceiptText("From: RAMSHANKAR PRASAD THAKUR ICICI\n₹500").payerName).toBe("RAMSHANKAR PRASAD THAKUR")
    expect(parseReceiptText("From: NEHA GUPTA State Bank of India\n₹500").payerName).toBe("NEHA GUPTA")
  })

  it("a second reading fills only what the first missed", () => {
    const a = { amount: 0, reference: "427134567890", otherRefs: [], payerName: "RAHUL", status: "unknown", confidence: 0.5 }
    const b = { amount: 11800, reference: "999999999999", otherRefs: ["CICAgKDj5vLqZQ"], payerName: "R4HUL", status: "success", confidence: 0.8 }
    const m = mergeReadings(a, b)
    expect(m).toMatchObject({ amount: 11800, reference: "427134567890", payerName: "RAHUL", status: "success", isPaymentProof: true, confidence: 0.8 })
    expect(readingScore(m)).toBe(3)
  })
})
