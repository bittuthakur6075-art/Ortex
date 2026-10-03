import { describe, it, expect } from "vitest"
import { parseAmount, referenceKind, pickReference, methodFor, parsePaidAt, normalizeReading, findDuplicate, matchInvoice, nameScore, parseReceiptText, parseReceiptDate, fixDigits, otsuThreshold, headlineAmount, combineReadings, looksLikeRupee, pickHeadline, evenPolarity, paymentDirection } from "./paymentReader"

const now = new Date("2026-10-01T12:00:00+05:30").getTime()

// A pixel map ("#" ink, "." paper) -> [grey, width] as looksLikeRupee takes it.
const glyph = (map) => {
  const rows = map.trim().split("\n")
  return [Uint8ClampedArray.from(rows.join(""), (c) => (c === "#" ? 0 : 255)), rows[0].length]
}

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
    expect(d.warnings.join(" ")).toMatch(/Not a payment/)
    expect(d.warnings.join(" ")).toMatch(/payment failed/)
    expect(d.warnings.join(" ")).toMatch(/Amount not found/)
    expect(d.warnings.join(" ")).toMatch(/Hard to read/)
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
    expect(d.warnings.join(" ")).toMatch(/payment failed/)
    expect(d.warnings.join(" ")).toMatch(/Hard to read/)
  })

  it("a photo of anything else is not a payment", () => {
    const d = read(`Lanyards 500 pcs\nBlue with logo`)
    expect(d.amount).toBe(null)
    expect(d.warnings.join(" ")).toMatch(/Not a payment/)
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
    // Even a confident read keeps the other one: the glyph may still be the ₹.
    expect(headlineAmount("31,200", 96)).toEqual({ amount: 31200, alt: 1200 })
    expect(headlineAmount("31,200", 82)).toEqual({ amount: 31200, alt: 1200 })
    expect(headlineAmount("31,200", 40)).toEqual({ amount: 1200, alt: 31200 })
    // 45,000 does not start with a digit ₹ turns into.
    expect(headlineAmount("45,000", 40)).toEqual({ amount: 45000, alt: null })
    const d = normalizeReading(parseReceiptText("Payment failed\n31,200\nUPI Ref No 427100000001", 90, { "31,200": 40 }), { now })
    expect(d).toMatchObject({ amount: 1200, amountAlt: 31200 })
    expect(d.warnings.join(" ")).toMatch(/₹1,200 or ₹31,200/)
  })

  it("77,500 at high confidence still asks: it may be ₹7,500", () => {
    expect(headlineAmount("77,500", 95)).toEqual({ amount: 77500, alt: 7500 })
    const d = normalizeReading(parseReceiptText("77,500\nUPI Ref No 427100000001", 95, { "77,500": 95 }), { now })
    expect(d).toMatchObject({ amount: 77500, amountAlt: 7500 })
    expect(d.warnings.join(" ")).toMatch(/Check the amount/)
  })

  it("Rs and INR only as words: never inside 'partners' or 'hrs'", () => {
    const d = parseReceiptText("Our partners 24x7 support\nPaid ₹1,180\nUPI Ref No 427100000001", 95)
    expect(normalizeReading(d, { now }).amount).toBe(1180)
    expect(parseReceiptText("Delivered in 2 hrs 30 min", 95).amount).toBeFalsy()
    expect(parseReceiptText("Amount Rs500", 95).amount).toBe(500)
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
    const m = combineReadings([a, b])
    expect(m).toMatchObject({ amount: 11800, reference: "427134567890", payerName: "RAHUL", status: "success", isPaymentProof: true, confidence: 0.8 })
    // A third pass that agrees with the second outvotes the first.
    expect(combineReadings([a, b, { ...b, payerName: "R4HUL" }]).payerName).toBe("R4HUL")
  })
})

describe("real screenshots and every UPI app", () => {
  it("the amount is the number in the largest font, even a bare ₹453", () => {
    const lines = [
      { text: "To Mr Prem Kumar Aggarwal", height: 22 },
      { text: "R453", height: 70 },
      { text: "110001", height: 20 },
      { text: "3 Sept 2026, 10:17am", height: 20 },
    ]
    expect(pickHeadline(lines)).toBe("R453")
    expect(headlineAmount("R453", 90, true)).toEqual({ amount: 453, alt: null })
    // A pincode in body text is never the headline.
    expect(pickHeadline([{ text: "110001", height: 20 }, { text: "Paid to", height: 20 }])).toBe("")
  })

  it("the user's Google Pay screenshot, as the browser reads it", () => {
    const text = `To Mr Prem Kumar Aggarwal
R453
Lift and cleaning
© Completed
3 Sept 2026, 10:17am
§? iciciBank 1912 v
UPI transaction ID
624605623703
To: Mr Prem Kumar Aggarwal
PhonePe « ++++:<6609@ibl
From: RAMSHANKAR PRASAD THAKUR (ICICI
Bank)
Google Pay + ++++37-3@okicici
Google transaction ID
CICAgPjgoq7Bcw`
    const d = normalizeReading(parseReceiptText(text, 84, {}, "R453"), { now })
    expect(d).toMatchObject({ amount: 453, method: "UPI", reference: "624605623703", party: "RAMSHANKAR PRASAD THAKUR", status: "success" })
    expect(d.date).toBe("2026-09-03T04:47:00.000Z")
    expect(d.note).toMatch(/Google Pay/)
    expect(d.warnings).toEqual([])
  })

  it("knows the app by name, else by the sender's UPI handle", () => {
    const app = (t) => parseReceiptText(t).app
    expect(app("Paid Successfully to\nORTEX\npaytm")).toBe("Paytm")
    expect(app("Payment successful\namazon pay")).toBe("Amazon Pay")
    expect(app("From: Arjun Pillai\narjun@naviaxis")).toBe("Navi")
    expect(app("From: Karan\nkaran@axisb")).toBe("CRED")
    expect(app("From: Sunita\nsunita@waicici")).toBe("WhatsApp Pay")
    expect(app("From: Ravi\nravi@ybl")).toBe("PhonePe")
    expect(app("SBI YONO\nTransaction Successful")).toBe("SBI YONO")
  })

  it("reads each app's own labels", () => {
    expect(parseReceiptText("Paid Successfully to\nORTEX INDUSTRIES").payeeName).toBe("ORTEX INDUSTRIES")
    expect(parseReceiptText("Payer\nAMIT VERMA\nPayee\nOrtex").payerName).toBe("AMIT VERMA")
    expect(parseReceiptText("Paid from: Rohit Mehra").payerName).toBe("Rohit Mehra")
    expect(parseReceiptText("Paid by: Vikas Jain").payerName).toBe("Vikas Jain")
    expect(parseReceiptText("Bank Reference ID\n427133344455").reference).toBe("427133344455")
    // A bank and a masked account are not a payer.
    expect(parseReceiptText("Debited from\nHDFC Bank XXXX1234").payerName).toBe("")
    expect(parseReceiptText("Money will be refunded if debited").status).toBe("failed")
  })
})

describe("evenPolarity", () => {
  // 4 pixels per row: a white row with dark text, a purple band with white text, a grey card row.
  const grey = Uint8ClampedArray.from([255, 255, 255, 20, 68, 68, 68, 255, 230, 230, 230, 40])
  it("inverts a dark band and whitens every row's background", () => {
    const out = [...evenPolarity(grey, 4)]
    expect(out.slice(0, 4)).toEqual([255, 255, 255, 20]) // untouched
    expect(out.slice(4, 8)).toEqual([255, 255, 255, 0]) // band: text now black on white
    expect(out.slice(8, 12)).toEqual([255, 255, 255, 44]) // grey card stretched to white
  })
  it("flips a dark-mode screen as a whole", () => {
    const dark = Uint8ClampedArray.from([30, 30, 30, 240])
    expect([...evenPolarity(dark, 4)]).toEqual([255, 255, 255, 17])
  })
})

describe("real screenshots, QA 2026-10-03", () => {
  it("does not read the hour of a time as a two-digit year, and dates Paytm's year-less receipts", () => {
    expect(parseReceiptDate("15 Mar, 07:22 PM | Ref. No: 601000757058", now)).toBe("2026-03-15T19:22:00+05:30")
    expect(parseReceiptDate("16 Aug, 06:27 PM | Ref No: 6228 4395 5349", now)).toBe("2026-08-16T18:27:00+05:30")
    // A day later in the year than today is last year's.
    expect(parseReceiptDate("15 Dec, 10:00 AM", now)).toBe("2025-12-15T10:00:00+05:30")
    // Two-digit years still work.
    expect(parseReceiptDate("30 Sep 26, 6:42 pm", now)).toBe("2026-09-30T18:42:00+05:30")
  })

  it("reads Paytm's unlabelled payee (above the UPI id) and payer (above the bank line)", () => {
    const r = parseReceiptText("Paytm\nArya Book Shop\npaytmqr61uwja@ptys\n420\nFour Hundred Twenty Rupees\nPaid Successfully\nBittu Kumar\n© Punjab National Bank - 9269\n16 Aug, 06:27 PM | Ref No: 6228 4395 5349", 88, {}, "420")
    expect(r.payeeName).toBe("Arya Book Shop")
    expect(r.payerName).toBe("Bittu Kumar")
    expect(r.app).toBe("Paytm")
    expect(r.amount).toBe(420)
    expect(r.reference).toBe("622843955349")
    const p = parseReceiptText("Paytm\nPreeti Kumari\n9667606137@pthdfc on Paytm\n10,000\nTen Thousand Rupees\nPaid Successfully\nTicket booking\nRamshankar Prasad Thakur\n¢ ICICI Bank - 1912\n18 Sep, 07:41 AM | Ref No: 2159 4602 2027", 87, {}, "10,000")
    expect(p.payeeName).toBe("Preeti Kumari")
    expect(p.payerName).toBe("Ramshankar Prasad Thakur")
  })

  it("lets a later pass with one clear headline settle an ambiguous one", () => {
    // ₹72.00 read as "72.00" (low confidence) -> 2 or 72; the 400px pass reads "¥72.00".
    const a = parseReceiptText("72.00\nCompleted\nSent to\nSaroj Kumar Sahu\n16 Aug 2026, 7:57 pm\nTransaction ID\n110452974474", 90, { "72.00": 35 }, "72.00")
    expect([a.amount, a.amountAlt]).toEqual([2, 72])
    const b = parseReceiptText("¥72.00\nCompleted", 90, {}, "¥72.00")
    const m = combineReadings([a, b])
    expect([m.amount, m.amountAlt]).toEqual([72, null])
    // A pass that agrees with neither reading changes nothing.
    expect(combineReadings([a, parseReceiptText("¥5.00\nCompleted", 90, {}, "¥5.00")]).amount).toBe(2)
  })

  it("a Google Pay ₹4,000.00 read as 34,000.00 (95% sure of the 3) is ₹4,000 by the glyph's shape", () => {
    // Pixel maps of the recogniser's boxes on the real screenshot: the headline "3" and the 3 in "12:34 pm".
    const rupee = glyph(`
....######################.........................
.##################################################
.##################################################
.##################################################
.##################################################
.##################################################
.##################################################
.......................#################...........
.............................###########...........
...............................##########..........
................................##########.........
.................................#########.........
..................................#########........
...................................########........
...................................#########.......
....................................########.......
....................................########.......
.##################################################
.##################################################
.##################################################
.##################################################
.##################################################
.##################################################
.##################################################
....................................#########......
....................................########.......
....................................########.......
...................................#########.......
...................................#########.......
..................................#########........
.................................##########........
................................##########.........
...............................###########.........
.............................############..........
..........................##############...........
.........##############################............
.........#############################.............
.........############################..............
.........##########################................
.........#########################.................
.........######################....................
.........##################........................
..........###########..............................
...........##########..............................
............##########.............................
.............##########............................
.............###########...........................
..............###########..........................
...............###########.........................
................###########........................
.................##########........................
..................##########.......................
...................##########......................
....................##########.....................
.....................##########....................
......................##########...................
.......................##########..................
........................##########.................
........................###########................
.........................###########...............
..........................###########..............
...........................###########.............
............................###########............
.............................##########............
..............................##########...........
...............................###########.........
................................##########.........
.................................##########........
..................................##########.......
..................................###########......
...................................###########.....
....................................###########....
.....................................###########...`)
    const three = glyph(`
.....########......
....###########....
...#############...
..####.......####..
.####........####..
..###.........###..
..............###..
..............####.
..............###..
..............###..
.............####..
...........#####...
.......#######.....
.......#######.....
.......#########...
.............####..
..............####.
...............###.
...............####
...............####
...............####
.###...........####
.###...........###.
.####.........####.
..####.......####..
...#############...
....###########....
.....########......`)
    expect(looksLikeRupee(...rupee)).toBe(true)
    expect(looksLikeRupee(...three)).toBe(false)
    expect(looksLikeRupee(new Uint8ClampedArray(20), 5)).toBe(null)
    const text = "34,000.00\nPaid to\njayanand kumar\n15 February 2026, 12:34 pm"
    expect(headlineAmount("34,000.00", 95, true, false, true)).toEqual({ amount: 4000, alt: null })
    expect(headlineAmount("34,000.00", 95, true, false, false)).toEqual({ amount: 34000, alt: null })
    const read = parseReceiptText(text, 90, { "34,000.00": 66 }, "34,000.00", false, true)
    expect([read.amount, read.amountAlt]).toEqual([4000, null])
    // A pass whose glyph was too small to judge stays ambiguous; the one that judged it settles it.
    const unsure = parseReceiptText(text, 90, { "34,000.00": 95 }, "34,000.00")
    expect([unsure.amount, unsure.amountAlt]).toEqual([34000, 4000])
    expect(combineReadings([unsure, read, unsure]).amount).toBe(4000)
  })

  it("ambiguous passes vote with their first choice and keep the other reading", () => {
    const one = { amount: 1200, amountAlt: 31200 }
    const other = { amount: 31200, amountAlt: 1200 }
    expect(combineReadings([one, other, other])).toMatchObject({ amount: 31200, amountAlt: 1200 })
    expect(combineReadings([{ amount: 0 }, { amount: 500 }]).amount).toBe(500)
  })
})

describe("paymentDirection: whose payment a screenshot shows", () => {
  const company = { name: "Ortex Industries", upi: "ortex@okhdfcbank", bankAccount: "50100123451912" }
  it("is money in when the company is the payee or its UPI ID is on screen", () => {
    expect(paymentDirection({ payeeName: "ORTEX INDUSTRIES PVT LTD", payerName: "Bittu Kumar" }, company)).toBe("inflow")
    expect(paymentDirection({ payerName: "Bittu Kumar", text: "To: Ortex\nUPI ID: ortex@okhdfcbank" }, company)).toBe("inflow")
  })
  it("is money out when the company is the payer or its account was debited", () => {
    expect(paymentDirection({ payerName: "Ortex Industries", payeeName: "Shree Packaging" }, company)).toBe("payout")
    expect(paymentDirection({ payeeName: "Preeti Kumari", text: "Ramshankar Prasad Thakur\nICICI Bank - 1912" }, company)).toBe("payout")
  })
  it("says nothing when the screenshot names neither side as the company, or both", () => {
    expect(paymentDirection({ payeeName: "Umesh Gulati" }, company)).toBe(null)
    expect(paymentDirection({ payeeName: "Ortex Industries", payerName: "Ortex Industries" }, company)).toBe(null)
    expect(paymentDirection({ payeeName: "Ortex Industries" }, {})).toBe(null)
    // A short or partial name never matches by accident.
    expect(paymentDirection({ payeeName: "Ort" }, company)).toBe(null)
  })
})

describe("paymentDirection: other names and accounts that mean us", () => {
  const company = { name: "Ortex Industries", paymentAliases: ["Ramshankar Prasad Thakur", "owner@okicici", "XXXX 9269"] }
  it("counts an owner's personal name, UPI ID and account as the company", () => {
    expect(paymentDirection({ payerName: "RAMSHANKAR PRASAD THAKUR", payeeName: "Preeti Kumari" }, company)).toBe("payout")
    expect(paymentDirection({ payerName: "Bittu Kumar", text: "UPI ID: owner@okicici" }, company)).toBe("inflow")
    expect(paymentDirection({ payeeName: "Arya Book Shop", text: "Bittu Kumar\nPunjab National Bank - 9269" }, company)).toBe("payout")
  })
  it("ignores blanks and too-short entries", () => {
    expect(paymentDirection({ payeeName: "Ram" }, { name: "Ortex Industries", paymentAliases: ["", "Ram", "  "] })).toBe(null)
  })
})

describe("a ₹ fused into the first digit", () => {
  it("keeps that digit when OCR boxed the ₹ and the 7 together", () => {
    // Google Pay "₹72.00" read as "72.00" at low confidence: without the box
    // width it reads as ₹2 (the 7 taken for the ₹), with it as ₹72.
    expect(headlineAmount("72.00", 35, true)).toEqual({ amount: 2, alt: 72 })
    expect(headlineAmount("72.00", 35, true, true)).toEqual({ amount: 72, alt: null })
    const r = parseReceiptText("72.00\nCompleted\nSent to\nSaroj Kumar Sahu\n16 Aug 2026, 7:57 pm\nTransaction ID\n110452974474", 90, { "72.00": 35 }, "72.00", true)
    expect([r.amount, r.amountAlt]).toEqual([72, null])
  })
  it("still doubts a normal-width leading 3 (a ₹ read as 3)", () => {
    expect(headlineAmount("34,000.00", 41, true, false)).toEqual({ amount: 4000, alt: 34000 })
  })
})
