import { describe, expect, test } from "vitest"
import {
  emailFormatProblem,
  emailTypoHint,
  errorsUnder,
  gstinCheckChar,
  gstinCheckDigitValid,
  gstinFormatProblem,
  indianPhoneProblem,
  tidyDocument,
  validateDocument,
} from "./validateDocument"
import { gstinProblem } from "./validateCustomer"

const NOW = new Date("2026-10-03T06:00:00Z").getTime()
const DAY = 86400000

// A draft that passes every rule; each test breaks one thing.
const good = (over = {}) => ({
  companyId: "ortex",
  customer: { name: "Ravi Kumar", company: "Bright Corp", email: "ravi@brightcorp.in", phone: "9811122233", gstin: "07BFMPM7025K1Z2", stateCode: "07", address: "B-12, Okhla Phase 2, New Delhi 110020" },
  shipTo: null,
  lines: [{ productId: null, description: "Acrylic award", hsn: "3926", quantity: 100, unit: "pcs", rate: 250, discountPercent: 0, gstRate: 18 }],
  extraDiscountPercent: 0,
  issueDate: new Date(NOW).toISOString(),
  validityDays: 15,
  paymentTerms: "50% advance",
  notes: "",
  terms: "",
  ...over,
})
const run = (doc, opts = {}) => validateDocument(doc, { now: NOW, ...opts })
const withCustomer = (patch) => good({ customer: { ...good().customer, ...patch } })
const withLine = (patch) => good({ lines: [{ ...good().lines[0], ...patch }] })

describe("GSTIN check digit", () => {
  test("real GSTINs pass", () => {
    for (const g of ["07BFMPM7025K1Z2", "07AABCW7659K1ZP", "27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "07AABCU9603R1ZP"]) {
      expect(gstinCheckDigitValid(g)).toBe(true)
      expect(gstinFormatProblem(g)).toBeNull()
    }
  })
  test("one changed character fails", () => {
    // 29ABCDE1234F1Z5 is the usual made-up example: its check character is W.
    expect(gstinCheckChar("29ABCDE1234F1Z5")).toBe("W")
    expect(gstinCheckDigitValid("29ABCDE1234F1Z5")).toBe(false)
    expect(gstinCheckDigitValid("29ABCDE1234F1ZW")).toBe(true)
    expect(gstinCheckDigitValid("07BFMPM7025K1Z3")).toBe(false)
    expect(gstinCheckDigitValid("07AABCU9603R1ZM")).toBe(false)
    expect(gstinFormatProblem("07BFMPM7025K1Z3")).toMatch(/typing mistake/)
  })
  test("lower case is read as upper case", () => {
    expect(gstinCheckDigitValid("07bfmpm7025k1z2")).toBe(true)
  })
  test("shape, state code and the embedded PAN", () => {
    expect(gstinFormatProblem("07BFMPM7025K1Z")).toMatch(/15 characters/)
    expect(gstinFormatProblem("99BFMPM7025K1Z2")).toMatch(/state code/)
    expect(gstinFormatProblem("07BFMXM7025K1Z2")).toMatch(/PAN/)
    expect(gstinFormatProblem("")).toBeNull()
  })
  test("the customer master uses the same check", () => {
    expect(gstinProblem("07BFMPM7025K1Z3", "07")).toEqual({ field: "gstin", message: expect.stringMatching(/typing mistake/) })
    expect(gstinProblem("07BFMPM7025K1Z2", "07")).toBeNull()
  })
})

describe("phone", () => {
  test("mobiles and landlines with their STD code", () => {
    for (const p of ["9811122233", "+91 98111 22233", "09811122233", "011-41234567", "080 4123 4567", "(022) 2345 6789"]) expect(indianPhoneProblem(p)).toBeNull()
  })
  test("wrong lengths and a landline without its code", () => {
    expect(indianPhoneProblem("98111")).toMatch(/10-digit/)
    expect(indianPhoneProblem("41234567")).toMatch(/STD code/)
    expect(indianPhoneProblem("98111222334455")).toMatch(/10-digit/)
    expect(indianPhoneProblem("98111abc22")).toMatch(/only digits/)
  })
  test("placeholder numbers", () => {
    for (const p of ["9999999999", "9000000000", "9876543210", "1234567890"]) expect(indianPhoneProblem(p)).toMatch(/placeholder/)
  })
  test("both phone and email missing is an error, either alone is fine", () => {
    expect(run(withCustomer({ phone: "", email: "" })).errors["customer.phone"]).toMatch(/phone number or an email/)
    expect(run(withCustomer({ phone: "" })).errors).toEqual({})
    expect(run(withCustomer({ email: "" })).errors).toEqual({})
  })
})

describe("email", () => {
  test("format, spaces and the domain ending", () => {
    expect(emailFormatProblem("ravi@brightcorp.in")).toBeNull()
    expect(emailFormatProblem("ravi.k+orders@mail.bright-corp.co.in")).toBeNull()
    expect(emailFormatProblem("ravi @bright.in")).toMatch(/no spaces/)
    expect(emailFormatProblem("ravi@bright")).toMatch(/email address/)
    expect(emailFormatProblem("ravi@bright.c")).toMatch(/email address/)
    expect(emailFormatProblem("ravi..k@bright.in")).toMatch(/email address/)
  })
  test("common slips are a warning with the fix", () => {
    expect(emailTypoHint("ravi@gmial.com")).toBe("Did you mean ravi@gmail.com?")
    expect(emailTypoHint("ravi@gmail.con")).toBe("Did you mean ravi@gmail.com?")
    expect(emailTypoHint("ravi@company.con")).toBe("Did you mean ravi@company.com?")
    expect(emailTypoHint("ravi@gmail.com")).toBeNull()
    const r = run(withCustomer({ email: "ravi@gmial.com" }))
    expect(r.errors).toEqual({})
    expect(r.warnings["customer.email"]).toMatch(/gmail\.com/)
  })
})

describe("customer", () => {
  test("a draft with everything right has nothing to say", () => {
    expect(run(good())).toEqual({ errors: {}, warnings: {} })
  })
  test("name or company is required, and neither may be only numbers", () => {
    expect(run(withCustomer({ name: "", company: "" })).errors["customer.name"]).toMatch(/name, or their company/)
    expect(run(withCustomer({ name: "" })).errors).toEqual({})
    expect(run(withCustomer({ name: "12345" })).errors["customer.name"]).toMatch(/only numbers/)
    expect(run(withCustomer({ company: "4567" })).errors["customer.company"]).toMatch(/only numbers/)
  })
  test("a GSTIN must agree with the customer's state", () => {
    expect(run(withCustomer({ stateCode: "27" })).errors["customer.stateCode"]).toMatch(/registered in Delhi/)
    expect(run(withCustomer({ stateCode: "" })).errors["customer.stateCode"]).toMatch(/needs its state/)
    expect(run(withCustomer({ gstin: "07BFMPM7025K1Z3" })).errors["customer.gstin"]).toMatch(/typing mistake/)
  })
  test("place of supply is required on every document", () => {
    expect(run(withCustomer({ gstin: "", stateCode: "" })).errors["customer.stateCode"]).toMatch(/place of supply/)
  })
  test("a GST customer needs a billing address; others do not", () => {
    expect(run(withCustomer({ address: "" })).errors["customer.address"]).toMatch(/billing address/)
    expect(run(withCustomer({ address: "", gstin: "" })).errors).toEqual({})
  })
  test("PIN codes and short addresses", () => {
    expect(run(withCustomer({ address: "Okhla Phase 2, New Delhi 11002" })).errors["customer.address"]).toMatch(/PIN code/)
    expect(run(withCustomer({ address: "Okhla Phase 2, New Delhi 011002" })).errors["customer.address"]).toMatch(/PIN code/)
    expect(run(withCustomer({ address: "Okhla, PIN: 1100201, New Delhi" })).errors["customer.address"]).toMatch(/PIN code/)
    expect(run(withCustomer({ address: "Andheri East, Mumbai 400 069" })).errors).toEqual({})
    expect(run(withCustomer({ address: "Plot 12, Sector 62, Noida" })).errors).toEqual({})
    expect(run(withCustomer({ address: "Delhi" })).warnings["customer.address"]).toMatch(/too short/)
  })
})

describe("ship to", () => {
  const ship = (patch) => good({ shipTo: { name: "Warehouse", company: "", email: "", phone: "", gstin: "", stateCode: "27", address: "Bhiwandi, Thane 421302", ...patch } })
  test("a complete ship-to passes, and needs no phone or email", () => {
    expect(run(ship({})).errors).toEqual({})
  })
  test("its state is the place of supply and its address is required", () => {
    expect(run(ship({ stateCode: "" })).errors["shipTo.stateCode"]).toMatch(/delivery state/)
    expect(run(ship({ address: "" })).errors["shipTo.address"]).toMatch(/delivery address/)
    expect(run(ship({ address: "Thane 42130" })).errors["shipTo.address"]).toMatch(/PIN code/)
    expect(run(ship({ phone: "12345" })).errors["shipTo.phone"]).toBeTruthy()
  })
  test("the bill-to may be in another state when goods ship elsewhere", () => {
    expect(run(good({ customer: { ...good().customer, gstin: "", stateCode: "" }, shipTo: { name: "Site", stateCode: "27", address: "Bhiwandi, Thane 421302" } })).errors).toEqual({})
  })
})

describe("lines", () => {
  test("at least one", () => {
    expect(run(good({ lines: [] })).errors.lines).toMatch(/at least one/)
  })
  test("description required", () => {
    expect(run(withLine({ description: "  " })).errors["lines.0.description"]).toMatch(/Describe/)
  })
  test("quantity above 0, whole for counted units, a sanity cap", () => {
    expect(run(withLine({ quantity: 0 })).errors["lines.0.quantity"]).toMatch(/more than 0/)
    expect(run(withLine({ quantity: -5 })).errors["lines.0.quantity"]).toMatch(/more than 0/)
    expect(run(withLine({ quantity: 2.5 })).errors["lines.0.quantity"]).toMatch(/whole number/)
    expect(run(withLine({ quantity: 2.5, unit: "sqft" })).errors).toEqual({})
    expect(run(withLine({ quantity: 2000000 })).warnings["lines.0.quantity"]).toMatch(/10 lakh/)
  })
  test("below the product's MOQ is a warning", () => {
    const products = [{ id: "p1", moq: 500 }]
    expect(run(withLine({ productId: "p1", quantity: 100 }), { products }).warnings["lines.0.quantity"]).toMatch(/minimum order of 500/)
    expect(run(withLine({ productId: "p1", quantity: 500 }), { products }).warnings).toEqual({})
  })
  test("rate: negative is an error, zero a warning", () => {
    expect(run(withLine({ rate: -1 })).errors["lines.0.rate"]).toMatch(/negative/)
    const free = run(good({ lines: [good().lines[0], { ...good().lines[0], description: "Sample", rate: 0 }] }))
    expect(free.warnings["lines.1.rate"]).toMatch(/free item/)
    expect(free.errors).toEqual({})
  })
  test("discount between 0 and 100", () => {
    expect(run(withLine({ discountPercent: 120 })).errors["lines.0.discountPercent"]).toMatch(/between 0 and 100/)
    expect(run(withLine({ discountPercent: -1 })).errors["lines.0.discountPercent"]).toMatch(/between 0 and 100/)
    expect(run(good({ extraDiscountPercent: 101 })).errors.extraDiscountPercent).toMatch(/between 0 and 100/)
  })
  test("GST rate from the console's list", () => {
    expect(run(withLine({ gstRate: 15 })).errors["lines.0.gstRate"]).toMatch(/GST must be one of 0, 5, 12, 18, 28/)
    expect(run(withLine({ gstRate: 0 })).errors).toEqual({})
  })
  test("HSN or SAC is 4, 6 or 8 digits; missing on a tax invoice is a warning", () => {
    expect(run(withLine({ hsn: "39261" })).errors["lines.0.hsn"]).toMatch(/4, 6 or 8/)
    expect(run(withLine({ hsn: "392690" })).errors).toEqual({})
    expect(run(withLine({ hsn: "" })).warnings).toEqual({})
    expect(run(withLine({ hsn: "" }), { kind: "invoice" }).warnings["lines.0.hsn"]).toMatch(/HSN/)
  })
  test("identical lines are a warning", () => {
    const l = good().lines[0]
    expect(run(good({ lines: [l, { ...l }] })).warnings["lines.1.description"]).toBe("Same as line 1")
  })
})

describe("document", () => {
  test("issue date valid and at most a day ahead", () => {
    expect(run(good({ issueDate: "" })).errors.issueDate).toMatch(/issue date/)
    expect(run(good({ issueDate: "nonsense" })).errors.issueDate).toMatch(/issue date/)
    expect(run(good({ issueDate: new Date(NOW + 2 * DAY).toISOString() })).errors.issueDate).toMatch(/future/)
    expect(run(good({ issueDate: new Date(NOW + DAY / 2).toISOString() })).errors).toEqual({})
  })
  test("quotation validity", () => {
    expect(run(good({ validityDays: -1 })).errors.validityDays).toMatch(/before the issue date/)
    expect(run(good({ validityDays: 120 })).warnings.validityDays).toMatch(/90 days/)
    expect(run(good({ validityDays: 90 })).warnings).toEqual({})
  })
  test("invoice due date not before the issue date", () => {
    const issue = new Date(NOW).toISOString()
    expect(run(good({ issueDate: issue, dueDate: new Date(NOW - 2 * DAY).toISOString() }), { kind: "invoice" }).errors.dueDate).toMatch(/due date/)
    expect(run(good({ issueDate: issue, dueDate: issue }), { kind: "invoice" }).errors).toEqual({})
  })
  test("the grand total must be above 0", () => {
    expect(run(withLine({ rate: 0 })).errors.total).toMatch(/₹0/)
    expect(run(good({ extraDiscountPercent: 100 })).errors.total).toMatch(/₹0/)
  })
  test("length caps", () => {
    expect(run(good({ paymentTerms: "x".repeat(201) })).errors.paymentTerms).toMatch(/200/)
    expect(run(good({ notes: "x".repeat(1001) })).warnings.notes).toMatch(/1000/)
    expect(run(good({ terms: "x".repeat(3001) })).warnings.terms).toMatch(/3000/)
  })
  test("a company must be chosen in All mode", () => {
    expect(run(good({ companyId: "" }), { companyRequired: true }).errors.companyId).toBe("Choose a company")
    expect(run(good({ companyId: "" })).errors).toEqual({})
  })
  test("errors come in screen order: company, customer, dates, lines", () => {
    const r = run({ companyId: "", customer: {}, lines: [{ description: "", quantity: 0, rate: 0, gstRate: 18 }], issueDate: "" }, { companyRequired: true })
    expect(Object.keys(r.errors)).toEqual(["companyId", "customer.name", "customer.phone", "customer.stateCode", "issueDate", "lines.0.description", "lines.0.quantity", "total"])
  })
})

describe("helpers", () => {
  test("tidyDocument trims parties and items", () => {
    const t = tidyDocument(good({ customer: { ...good().customer, name: "  Ravi ", gstin: " 07bfmpm7025k1z2 " }, lines: [{ ...good().lines[0], description: " Award " }] }))
    expect([t.customer.name, t.customer.gstin, t.lines[0].description, t.shipTo]).toEqual(["Ravi", "07BFMPM7025K1Z2", "Award", null])
  })
  test("errorsUnder picks one part", () => {
    expect(errorsUnder({ "customer.phone": "a", "shipTo.phone": "b", "lines.0.rate": "c" }, "customer")).toEqual({ phone: "a" })
    expect(errorsUnder({ "lines.0.rate": "c", "lines.10.rate": "d" }, "lines.1")).toEqual({})
  })
})

describe("an invoice imported from Tally (totals only, no lines)", () => {
  test("is not asked to add items", () => {
    const r = validateDocument({ number: "INV-1", issueDate: "2026-10-01", customer: { name: "Acme", phone: "9812345678", stateCode: "07" }, lines: [], totals: { grandTotal: 1180 }, tally: { status: "synced" } }, { kind: "invoice", now: Date.parse("2026-10-03") })
    expect(r.errors.lines).toBeUndefined()
  })
})
