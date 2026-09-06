// Contact validation.
//
// A customer row is the join key for this whole app: quotations and enquiries
// are matched back to a person by email-then-phone (`sameCustomer`), and the GST
// state code on the row decides CGST+SGST versus IGST on every document raised
// for them. So the rules that guard the "New contact" form are worth testing off
// the phone, where a wrong split or a duplicated master is cheap to catch.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { digitsOf, nationalDigits, normaliseContact, phoneProblem, validateContact } = await loadTs(
  "features/contacts/validateContact.ts",
)

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

test("a contact needs a name or a company", () => {
  const errors = validateContact(draft({ phone: "9876543210" }))
  assert.equal(errors.name, "Enter a name, or a company")

  assert.equal(validateContact(draft({ name: "Ravi", phone: "9876543210" })).name, undefined)
  // A company alone is a legitimate contact — the buying desk of a firm.
  assert.equal(validateContact(draft({ company: "Acme Pvt Ltd", phone: "9876543210" })).name, undefined)
})

test("a contact with neither phone nor email is refused", () => {
  const errors = validateContact(draft({ name: "Ravi" }))
  assert.match(errors.form, /phone number or an email/)

  assert.equal(validateContact(draft({ name: "Ravi", phone: "9876543210" })).form, undefined)
  assert.equal(validateContact(draft({ name: "Ravi", email: "ravi@acme.in" })).form, undefined)
})

test("phone length is checked, but landlines are allowed", () => {
  assert.equal(phoneProblem(""), null)
  assert.equal(phoneProblem("9876543210"), null)
  // +91 prefixed, and an STD-code landline.
  assert.equal(phoneProblem("+91 98765 43210"), null)
  assert.equal(phoneProblem("011 2345 6789"), null)
  assert.match(phoneProblem("98765"), /too short/)
  assert.match(phoneProblem("9876543210987"), /too long/)
})

test("email shape is checked loosely", () => {
  const bad = validateContact(draft({ name: "Ravi", email: "ravi@acme" }))
  assert.match(bad.email, /email address/)
  assert.equal(validateContact(draft({ name: "Ravi", email: "ravi@acme.in" })).email, undefined)
  assert.equal(validateContact(draft({ name: "R", email: "r.k+tag@sub.acme.co.in" })).email, undefined)
})

test("a GSTIN must be well formed and carry a real state code", () => {
  const base = { name: "Ravi", phone: "9876543210" }
  assert.equal(validateContact(draft({ ...base, gstin: "07AABCU9603R1ZM" })).gstin, undefined)
  assert.match(validateContact(draft({ ...base, gstin: "07AABCU9603R1Z" })).gstin, /15 characters/)
  // 99 is not a state.
  assert.match(validateContact(draft({ ...base, gstin: "99AABCU9603R1ZM" })).gstin, /state code/)
})

test("a GSTIN that disagrees with the place of supply is refused", () => {
  const errors = validateContact(
    draft({ name: "Ravi", phone: "9876543210", gstin: "07AABCU9603R1ZM", stateCode: "27" }),
  )
  assert.match(errors.stateCode, /does not match/)

  assert.equal(
    validateContact(draft({ name: "Ravi", phone: "9876543210", gstin: "07AABCU9603R1ZM", stateCode: "07" }))
      .stateCode,
    undefined,
  )
})

test("a duplicate is caught on email or on phone digits, the way sameCustomer matches", () => {
  const master = [{ id: "c1", name: "Ravi Kumar", email: "ravi@acme.in", phone: "9876543210" }]

  const byPhone = validateContact(draft({ name: "R Kumar", phone: "+91 98765 43210" }), master)
  assert.match(byPhone.form, /already belong to Ravi Kumar/)

  const byEmail = validateContact(draft({ name: "R Kumar", email: "RAVI@ACME.IN" }), master)
  assert.match(byEmail.form, /already belong to Ravi Kumar/)

  // A different person is fine…
  assert.equal(validateContact(draft({ name: "Sunil", phone: "9000000000" }), master).form, undefined)
  // …and a row never counts as its own duplicate when it is being edited.
  assert.equal(
    validateContact(draft({ name: "Ravi Kumar", phone: "9876543210" }), master, "c1").form,
    undefined,
  )
})

test("normalising stores digits, uppercases the GSTIN, and fills the state from it", () => {
  const row = normaliseContact(
    draft({
      name: "  Ravi Kumar ",
      company: " Acme Pvt Ltd ",
      email: " ravi@acme.in ",
      phone: "+91 98765-43210",
      gstin: " 07aabcu9603r1zm ",
    }),
  )

  assert.equal(row.name, "Ravi Kumar")
  assert.equal(row.company, "Acme Pvt Ltd")
  assert.equal(row.email, "ravi@acme.in")
  assert.equal(row.phone, "9876543210")
  assert.equal(row.gstin, "07AABCU9603R1ZM")
  // Blank picker, but the GSTIN knows the answer.
  assert.equal(row.stateCode, "07")

  // An explicit choice is never overwritten by the GSTIN.
  assert.equal(normaliseContact(draft({ gstin: "07AABCU9603R1ZM", stateCode: "27" })).stateCode, "27")
})

test("digitsOf strips everything a number is typed with", () => {
  assert.equal(digitsOf("+91 (98765) 43210"), "919876543210")
  assert.equal(digitsOf(""), "")
  assert.equal(digitsOf(undefined), "")
})

test("nationalDigits strips +91 and the trunk 0, so matching works on one shape", () => {
  assert.equal(nationalDigits("+91 98765 43210"), "9876543210")
  assert.equal(nationalDigits("09876543210"), "9876543210")
  assert.equal(nationalDigits("9876543210"), "9876543210")
  // An 8-digit landline is left whole; there is no code to strip.
  assert.equal(nationalDigits("23456789"), "23456789")
})
