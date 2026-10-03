// What a quotation or invoice draft has to satisfy before it is saved.
//
// MIRRORED line for line in Ortex.Mobile/src/domain/validateDocument.ts (parity
// test Ortex.Mobile/test/validateDocument.test.mjs). Edit both. Pure, covered by
// validateDocument.test.js.
//
// validateDocument(doc, opts) -> { errors, warnings }, each { path: message }.
// Errors block Save; warnings are said but allow it. Paths name the field:
// "customer.phone", "shipTo.address", "lines.2.quantity", "issueDate",
// "validityDays", "dueDate", "total", ... in the order the editors show them,
// so the first error is the first field on screen.
//
// opts: { kind: "quotation" | "invoice", products, companyRequired, now }

import { GST_STATES } from "./gstStates"
import { isValidPincode } from "./address"
import { computeDocument } from "./pricing"
import { GST_RATES } from "../data/domain/schema"

const DAY = 86400000
const str = (v) => String(v ?? "").trim()
const digitsOf = (v) => String(v ?? "").replace(/\D/g, "")

// ---- GSTIN -----------------------------------------------------------------

// 15 characters: 2 state digits, PAN (5 letters, 4 digits, 1 letter), entity
// number, "Z", check character.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

// The GSTN's mod-36 check character over the first 14 characters.
export function gstinCheckChar(first14) {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]
}

// True when the 15th character is the one the first 14 produce.
export function gstinCheckDigitValid(gstin) {
  const g = str(gstin).toUpperCase()
  return GSTIN_PATTERN.test(g) && gstinCheckChar(g) === g[14]
}

// The PAN's 4th character says who holds it (company, person, firm, ...).
const PAN_HOLDER = "ABCFGHJLPT"

// The GSTIN on its own: shape, state, embedded PAN, check character.
export function gstinFormatProblem(gstin) {
  const g = str(gstin).toUpperCase()
  if (!g) return null
  if (!GSTIN_PATTERN.test(g)) return "A GSTIN is 15 characters, like 07AABCU9603R1ZP"
  if (!GST_STATES[g.slice(0, 2)]) return "That GSTIN does not start with a valid state code"
  if (!PAN_HOLDER.includes(g[5])) return "The PAN inside this GSTIN is not valid"
  if (!gstinCheckDigitValid(g)) return "This GSTIN has a typing mistake: its last character does not match"
  return null
}

// ---- phone and email -------------------------------------------------------

// 9999999999, 9000000000, 1234567890, 9876543210: typed to get past a form.
function junkNumber(d) {
  if (/^(\d)\1+$/.test(d.slice(1))) return true
  const step = (Number(d[1]) - Number(d[0]) + 10) % 10
  if (step !== 1 && step !== 9) return false
  for (let i = 1; i < d.length; i++) if ((Number(d[i]) - Number(d[i - 1]) + 10) % 10 !== step) return false
  return true
}

// An Indian mobile (10 digits from 6 to 9) or a landline with its STD code
// (10 digits with the code, often written with a leading 0), +91 allowed.
export function indianPhoneProblem(phone) {
  const raw = str(phone)
  if (!raw) return null
  if (/[^\d\s+()./-]/.test(raw)) return "A phone number has only digits, spaces and +"
  let d = digitsOf(raw)
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2)
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  if (d.length >= 6 && d.length <= 8) return "Add the STD code to this landline number"
  if (d.length !== 10) return "Enter a 10-digit mobile number, or a landline with its STD code"
  if (d[0] === "0") return "That is not a valid Indian phone number"
  if (junkNumber(d)) return "That looks like a placeholder number. Enter the real one"
  return null
}

const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

export function emailFormatProblem(email) {
  const value = str(email)
  if (!value) return null
  if (/\s/.test(value)) return "An email address has no spaces"
  return EMAIL.test(value) ? null : "That does not look like an email address"
}

const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.in": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yaho.co.in": "yahoo.co.in",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "redifmail.com": "rediffmail.com",
  "rediffmial.com": "rediffmail.com",
}

// "Did you mean ravi@gmail.com?" for a well-formed address with a common slip.
export function emailTypoHint(email) {
  const value = str(email)
  if (emailFormatProblem(value)) return null
  const at = value.lastIndexOf("@")
  const domain = value.slice(at + 1).toLowerCase()
  const fixed = DOMAIN_TYPOS[domain] || (/\.(con|cmo|comm|cpm|vom)$/.test(domain) ? domain.replace(/\.[a-z]+$/, ".com") : null)
  return fixed ? `Did you mean ${value.slice(0, at)}@${fixed}?` : null
}

// ---- addresses and names ---------------------------------------------------

// A PIN code in a free-text address: after "PIN", or the number it ends with.
function pincodeIn(address) {
  const labelled = address.match(/\bpin(?:\s*code)?\s*[:.-]?\s*(\d[\d ]*\d)/i)
  if (labelled) return labelled[1].replace(/ /g, "")
  const trailing = address.match(/(?:^|\D)(\d{3} ?\d{2,4})\s*\.?$/)
  return trailing ? trailing[1].replace(/ /g, "") : null
}

function addressRules(address, path, required, errors, warnings) {
  const a = str(address)
  if (!a) {
    if (required) errors[path] = required
    return
  }
  const pin = pincodeIn(a)
  if (pin && !isValidPincode(pin)) errors[path] = "The PIN code should be 6 digits and not start with 0"
  else if (a.length < 10) warnings[path] = "This address looks too short to deliver to"
}

const onlyDigits = (v) => /^[\d\s.+-]+$/.test(v)

// ---- the party (bill to, ship to) ------------------------------------------

function partyRules(c, prefix, isShipTo, errors, warnings) {
  const p = (k) => `${prefix}.${k}`
  const name = str(c.name)
  const company = str(c.company)
  if (!isShipTo && !name && !company) errors[p("name")] = "Enter the customer's name, or their company"
  if (name && onlyDigits(name)) errors[p("name")] = "A name cannot be only numbers"
  if (company && onlyDigits(company)) errors[p("company")] = "A company name cannot be only numbers"

  const phoneError = indianPhoneProblem(c.phone)
  if (phoneError) errors[p("phone")] = phoneError
  const emailError = emailFormatProblem(c.email)
  const typo = emailTypoHint(c.email)
  if (emailError) errors[p("email")] = emailError
  else if (typo) warnings[p("email")] = typo
  if (!isShipTo && !str(c.phone) && !str(c.email)) errors[p("phone")] = "Add a phone number or an email"

  const gstin = str(c.gstin).toUpperCase()
  const gstError = gstinFormatProblem(gstin)
  const state = str(c.stateCode)
  if (gstError) errors[p("gstin")] = gstError
  else if (gstin && !state) errors[p("stateCode")] = "Choose the state. A GSTIN needs its state"
  else if (gstin && state !== gstin.slice(0, 2)) errors[p("stateCode")] = `The GSTIN is registered in ${GST_STATES[gstin.slice(0, 2)]}, not this state`

  addressRules(
    c.address,
    p("address"),
    isShipTo ? "Enter the delivery address" : gstin ? "A GST customer needs a billing address" : "",
    errors,
    warnings,
  )
}

// ---- line items --------------------------------------------------------------

const COUNTED_UNITS = ["pcs", "pc", "nos", "no", "set", "sets", "box"]
const lineKey = (l) => [l.productId || "", str(l.description).toLowerCase(), str(l.hsn), Number(l.quantity), str(l.unit), Number(l.rate), Number(l.discountPercent) || 0, Number(l.gstRate)].join("|")

function lineRules(lines, kind, products, errors, warnings) {
  if (!lines.length) {
    errors.lines = "Add at least one item"
    return
  }
  const seen = new Map()
  lines.forEach((l, i) => {
    const p = (k) => `lines.${i}.${k}`
    if (!str(l.description)) errors[p("description")] = "Describe this item, or remove the line"

    const qty = Number(l.quantity)
    const unit = str(l.unit).toLowerCase()
    if (!Number.isFinite(qty) || qty <= 0) errors[p("quantity")] = "Quantity must be more than 0"
    else if (COUNTED_UNITS.includes(unit) && !Number.isInteger(qty)) errors[p("quantity")] = `Quantity in ${unit} must be a whole number`
    else if (qty > 1000000) warnings[p("quantity")] = "That is more than 10 lakh. Check the quantity"
    else {
      const product = l.productId ? products?.find((x) => x.id === l.productId) : undefined
      const moq = Number(product?.moq) || 0
      if (moq > 1 && qty < moq) warnings[p("quantity")] = `Below the minimum order of ${moq}`
    }

    const rate = Number(l.rate)
    if (!Number.isFinite(rate) || rate < 0) errors[p("rate")] = "The rate cannot be negative"
    else if (rate === 0) warnings[p("rate")] = "The rate is 0. Is this a free item?"

    const disc = Number(l.discountPercent) || 0
    if (disc < 0 || disc > 100) errors[p("discountPercent")] = "Discount must be between 0 and 100%"

    if (!GST_RATES.includes(Number(l.gstRate))) errors[p("gstRate")] = `GST must be one of ${GST_RATES.join(", ")}%`

    const hsn = str(l.hsn)
    if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) errors[p("hsn")] = "HSN or SAC is 4, 6 or 8 digits"
    else if (!hsn && kind === "invoice") warnings[p("hsn")] = "A tax invoice should show the HSN code"

    const key = lineKey(l)
    if (str(l.description) && seen.has(key)) warnings[p("description")] = `Same as line ${(seen.get(key) ?? 0) + 1}`
    else if (!seen.has(key)) seen.set(key, i)
  })
}

// ---- the document ------------------------------------------------------------

const LIMITS = { paymentTerms: 200, notes: 1000, terms: 3000 }

export function validateDocument(doc, { kind = "quotation", products = [], companyRequired = false, now = Date.now() } = {}) {
  const errors = {}
  const warnings = {}
  const d = doc || {}

  if (companyRequired && !str(d.companyId)) errors.companyId = "Choose a company"

  partyRules(d.customer || {}, "customer", false, errors, warnings)
  if (d.shipTo) partyRules(d.shipTo, "shipTo", true, errors, warnings)
  // The place of supply decides CGST + SGST or IGST: never left to a default.
  if (d.shipTo && !str(d.shipTo.stateCode)) errors["shipTo.stateCode"] = "Choose the delivery state. It is the place of supply"
  else if (!d.shipTo && !str(d.customer?.stateCode) && !errors["customer.stateCode"])
    errors["customer.stateCode"] = "Choose the place of supply. It decides CGST + SGST or IGST"

  const issue = new Date(d.issueDate).getTime()
  if (!d.issueDate || Number.isNaN(issue)) errors.issueDate = "Enter the issue date"
  else if (issue > now + DAY) errors.issueDate = "The issue date cannot be in the future"

  if (kind === "quotation" && !errors.issueDate) {
    const days = d.validityDays
    const until = days != null && days !== "" ? issue + Number(days) * DAY : new Date(d.validUntil).getTime()
    if (Number.isNaN(until) || until < issue) errors.validityDays = "Valid until cannot be before the issue date"
    else if (until - issue > 90 * DAY) warnings.validityDays = "Valid for more than 90 days. Prices may change by then"
  }
  if (kind === "invoice" && d.dueDate && !errors.issueDate) {
    const due = new Date(d.dueDate).getTime()
    if (Number.isNaN(due) || toDay(due) < toDay(issue)) errors.dueDate = "The due date cannot be before the issue date"
  }

  const lines = d.lines || []
  // A document imported from Tally keeps its totals only, never lines: it is
  // not built here, so its missing lines are not a mistake to fix.
  const imported = !!d.tally && !lines.length
  if (!imported) lineRules(lines, kind, products, errors, warnings)

  const extra = Number(d.extraDiscountPercent) || 0
  if (extra < 0 || extra > 100) errors.extraDiscountPercent = "Discount must be between 0 and 100%"
  else if (lines.length && computeDocument(lines, { extraDiscountPercent: extra }).grandTotal <= 0)
    errors.total = "The total is ₹0. Add a rate to at least one item"

  if (str(d.paymentTerms).length > LIMITS.paymentTerms) errors.paymentTerms = `Keep payment terms under ${LIMITS.paymentTerms} characters`
  if (str(d.notes).length > LIMITS.notes) warnings.notes = `Notes over ${LIMITS.notes} characters may not fit on the page`
  if (str(d.terms).length > LIMITS.terms) warnings.terms = `Terms over ${LIMITS.terms} characters may not fit on the page`

  return { errors, warnings }
}

const toDay = (t) => Math.floor((t + 5.5 * 3600000) / DAY)

// The fields of a party as they should be stored: trimmed, GSTIN in capitals.
export function tidyParty(c) {
  if (!c) return c
  const out = { ...c }
  for (const k of ["name", "company", "email", "phone", "address"]) if (typeof out[k] === "string") out[k] = out[k].trim()
  if (typeof out.gstin === "string") out.gstin = out.gstin.trim().toUpperCase()
  return out
}

// The draft as it should be stored once it passes: parties and item text trimmed.
export function tidyDocument(doc) {
  return {
    ...doc,
    customer: tidyParty(doc.customer),
    shipTo: tidyParty(doc.shipTo),
    lines: (doc.lines || []).map((l) => ({ ...l, description: str(l.description), hsn: str(l.hsn) })),
  }
}

// The paths of one part ("customer", "lines.2"), with that prefix taken off.
export function errorsUnder(map, prefix) {
  const out = {}
  for (const [k, v] of Object.entries(map || {})) if (k.startsWith(prefix + ".")) out[k.slice(prefix.length + 1)] = v
  return out
}
