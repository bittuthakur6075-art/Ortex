// Mirrors Ortex.Mobile/test/contact.test.mjs case for case, so the console and
// the phone refuse the same customers.
import { describe, expect, test } from "vitest"
import {
  digitsOf,
  findDuplicate,
  gstinProblem,
  nationalDigits,
  normaliseCustomer,
  phoneProblem,
  validateCustomer,
} from "./validateCustomer"
import { sameCustomer } from "../data/domain/domain"

const draft = (overrides = {}) => ({
  name: "",
  company: "",
  email: "",
  phone: "",
  gstin: "",
  stateCode: "",
  address: "",
  ...overrides,
})

describe("validateCustomer", () => {
  test("a customer needs a name or a company", () => {
    expect(validateCustomer(draft({ phone: "9876543210" })).name).toBe("Enter a name, or a company")
    expect(validateCustomer(draft({ name: "Ravi", phone: "9876543210" })).name).toBeUndefined()
    expect(validateCustomer(draft({ company: "Acme Pvt Ltd", phone: "9876543210" })).name).toBeUndefined()
  })

  test("a customer with neither phone nor email is refused", () => {
    expect(validateCustomer(draft({ name: "Ravi" })).form).toMatch(/phone number or an email/)
    expect(validateCustomer(draft({ name: "Ravi", phone: "9876543210" })).form).toBeUndefined()
    expect(validateCustomer(draft({ name: "Ravi", email: "ravi@acme.in" })).form).toBeUndefined()
  })

  test("phone length is checked, but landlines are allowed", () => {
    expect(phoneProblem("")).toBeNull()
    expect(phoneProblem("9876543210")).toBeNull()
    expect(phoneProblem("+91 98765 43210")).toBeNull()
    expect(phoneProblem("011 2345 6789")).toBeNull()
    expect(phoneProblem("98765")).toMatch(/too short/)
    expect(phoneProblem("9876543210987")).toMatch(/too long/)
  })

  test("email shape is checked loosely", () => {
    expect(validateCustomer(draft({ name: "Ravi", email: "ravi@acme" })).email).toMatch(/email address/)
    expect(validateCustomer(draft({ name: "Ravi", email: "ravi@acme.in" })).email).toBeUndefined()
    expect(validateCustomer(draft({ name: "R", email: "r.k+tag@sub.acme.co.in" })).email).toBeUndefined()
  })

  test("a GSTIN must be well formed and carry a real state code", () => {
    const base = { name: "Ravi", phone: "9876543210" }
    expect(validateCustomer(draft({ ...base, gstin: "07AABCU9603R1ZM" })).gstin).toBeUndefined()
    expect(validateCustomer(draft({ ...base, gstin: "07AABCU9603R1Z" })).gstin).toMatch(/15 characters/)
    expect(validateCustomer(draft({ ...base, gstin: "99AABCU9603R1ZM" })).gstin).toMatch(/state code/)
  })

  test("a GSTIN that disagrees with the place of supply is refused", () => {
    const base = { name: "Ravi", phone: "9876543210", gstin: "07AABCU9603R1ZM" }
    expect(validateCustomer(draft({ ...base, stateCode: "27" })).stateCode).toMatch(/does not match/)
    expect(validateCustomer(draft({ ...base, stateCode: "07" })).stateCode).toBeUndefined()
    expect(gstinProblem("07aabcu9603r1zm", "27")).toEqual({
      field: "stateCode",
      message: "The place of supply does not match the GSTIN's state",
    })
  })

  test("a duplicate is caught on email or on phone digits, the way sameCustomer matches", () => {
    const master = [{ id: "c1", name: "Ravi Kumar", email: "ravi@acme.in", phone: "9876543210" }]

    expect(validateCustomer(draft({ name: "R Kumar", phone: "+91 98765 43210" }), master).form).toMatch(
      /already belong to Ravi Kumar/,
    )
    expect(validateCustomer(draft({ name: "R Kumar", email: "RAVI@ACME.IN" }), master).form).toMatch(
      /already belong to Ravi Kumar/,
    )
    expect(findDuplicate(draft({ phone: "09876543210" }), master)?.id).toBe("c1")

    expect(validateCustomer(draft({ name: "Sunil", phone: "9000000000" }), master).form).toBeUndefined()
    expect(validateCustomer(draft({ name: "Ravi Kumar", phone: "9876543210" }), master, "c1").form).toBeUndefined()
  })

  test("normalising stores digits, uppercases the GSTIN, and fills the state from it", () => {
    const row = normaliseCustomer(
      draft({
        name: "  Ravi Kumar ",
        company: " Acme Pvt Ltd ",
        email: " ravi@acme.in ",
        phone: "+91 98765-43210",
        gstin: " 07aabcu9603r1zm ",
      }),
    )
    expect(row.name).toBe("Ravi Kumar")
    expect(row.company).toBe("Acme Pvt Ltd")
    expect(row.email).toBe("ravi@acme.in")
    expect(row.phone).toBe("9876543210")
    expect(row.gstin).toBe("07AABCU9603R1ZM")
    expect(row.stateCode).toBe("07")
    expect(normaliseCustomer(draft({ gstin: "07AABCU9603R1ZM", stateCode: "27" })).stateCode).toBe("27")
  })

  test("digitsOf strips everything a number is typed with", () => {
    expect(digitsOf("+91 (98765) 43210")).toBe("919876543210")
    expect(digitsOf("")).toBe("")
    expect(digitsOf(undefined)).toBe("")
  })

  test("nationalDigits strips +91 and the trunk 0, so matching works on one shape", () => {
    expect(nationalDigits("+91 98765 43210")).toBe("9876543210")
    expect(nationalDigits("09876543210")).toBe("9876543210")
    expect(nationalDigits("9876543210")).toBe("9876543210")
    expect(nationalDigits("23456789")).toBe("23456789")
  })
})

describe("sameCustomer", () => {
  test("matches a +91 number against the bare 10 digits", () => {
    expect(sameCustomer({ phone: "+91 98765 43210" }, { phone: "9876543210" })).toBe(true)
    expect(sameCustomer({ phone: "09876543210" }, { phone: "919876543210" })).toBe(true)
    expect(sameCustomer({ phone: "9876543210" }, { phone: "9000000000" })).toBe(false)
    expect(sameCustomer({ email: "A@b.in" }, { email: " a@b.in" })).toBe(true)
    expect(sameCustomer({}, {})).toBe(false)
  })
})
