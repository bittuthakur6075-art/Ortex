// Anu for staff: the answers behind her tools (src/domain/anu.ts).
//
// These are what a voice model reads aloud to a rep, so the assertions are about
// the things that would be embarrassing to get wrong on a call: matching the
// wrong customer, counting a lead twice, pricing a quote from the wrong product,
// or saying a record exists when the person has no access to it.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const anu = await loadTs("domain/anu.ts")
const { VOICE_SOURCE } = await loadTs("domain/voice.ts")

const NOW = new Date("2026-09-13T10:00:00.000Z").getTime()
const DAY = 86400000
const ago = (d) => new Date(NOW - d * DAY).toISOString()
const inDays = (d) => new Date(NOW + d * DAY).toISOString()

const customer = (over = {}) => ({ name: "Ravi Sharma", company: "Sharma Traders", email: "ravi@sharma.in", phone: "9876543210", gstin: "", stateCode: "08", address: "", ...over })
const quote = (over = {}) => ({
  id: "q1",
  number: "QT-0101",
  status: "sent",
  customer: customer(),
  lines: [{ description: "Satin lanyards", quantity: 500, unit: "pcs", rate: 18, gstRate: 18 }],
  totals: { grandTotal: 10620, taxable: 9000, gstTotal: 1620, totalDiscount: 0, interState: false },
  issueDate: ago(2),
  validUntil: inDays(2),
  createdAt: ago(2),
  ...over,
})
const enquiry = (over = {}) => ({ id: "e1", createdAt: ago(0), customer: customer(), source: "Website form", productInterest: "MDF name boards", message: "", status: "new", ...over })
const ALL = { enquiries: true, voice: true, quotations: true, customers: true, products: true }

test("matchScore needs every word, and matches a phone however it is spoken", () => {
  assert.ok(anu.matchScore("sharma lanyard", ["Ravi Sharma", "Satin lanyards"]) > 0)
  assert.equal(anu.matchScore("sharma trophy", ["Ravi Sharma", "Satin lanyards"]), 0)
  assert.equal(anu.matchScore("+91 98765 43210", ["9876543210"]), 10)
  assert.ok(anu.matchScore("sharma", ["Sharma Traders"]) > anu.matchScore("sharma", ["Ravi Sharma"]))
})

test("findCustomers ranks by the name and joins their quotations by phone", () => {
  const customers = [
    { id: "c1", ...customer() },
    { id: "c2", ...customer({ name: "Anita Verma", company: "Verma & Co", phone: "9123456780", email: "a@v.in" }) },
  ]
  const quotations = [quote(), quote({ id: "q2", number: "QT-0102", status: "accepted" }), quote({ id: "q3", customer: customer({ phone: "9000000000", email: "x@y.z" }) })]
  const [hit, ...rest] = anu.findCustomers(customers, quotations, "sharma")
  assert.equal(rest.length, 0)
  assert.equal(hit.id, "c1")
  assert.equal(hit.quotations, 2)
  assert.match(hit.won_value, /10,620/)
})

test("briefing counts untouched web enquiries, returns Anu calls and lapsing quotes, and respects access", () => {
  const enquiries = [
    enquiry(),
    enquiry({ id: "e2", createdAt: ago(3) }),
    enquiry({ id: "e3", status: "contacted" }),
    enquiry({ id: "v1", source: VOICE_SOURCE, message: "Needs 200 trophies", customer: customer({ name: "Mohan", phone: "9811111111" }) }),
  ]
  const quotations = [quote(), quote({ id: "q2", validUntil: ago(1) }), quote({ id: "q3", validUntil: inDays(20), issueDate: ago(9) })]

  const b = anu.briefing({ enquiries, quotations }, ALL, NOW)
  assert.equal(b.new_enquiries.count, 2)
  assert.equal(b.new_enquiries.waiting_over_2_days, 1)
  assert.equal(b.anu_calls_to_return.count, 1)
  assert.equal(b.quotations.expiring_within_3_days.length, 1)
  assert.equal(b.quotations.already_expired_but_still_sent.length, 1)
  assert.equal(b.quotations.waiting_a_week_or_more.length, 1)

  const salesOnly = anu.briefing({ enquiries, quotations }, { ...ALL, quotations: false }, NOW)
  assert.equal(salesOnly.quotations, undefined)
})

test("findEnquiries keeps web enquiries and Anu calls apart and filters by status", () => {
  const enquiries = [
    enquiry(),
    enquiry({ id: "e2", status: "won", productInterest: "Acrylic trophies" }),
    enquiry({ id: "v1", source: VOICE_SOURCE, message: "Lanyards", customer: customer({ name: "Mohan", phone: "9811111111" }) }),
  ]
  const all = anu.findEnquiries(enquiries, {}, ALL, NOW)
  assert.equal(all.total, 3)
  assert.equal(anu.findEnquiries(enquiries, { status: "won" }, ALL, NOW).total, 1)
  assert.equal(anu.findEnquiries(enquiries, {}, { enquiries: true, voice: false }, NOW).total, 2)
  assert.ok(anu.findEnquiries(enquiries, {}, ALL, NOW).results.some((r) => r.kind === "voice_call"))
})

test("salesSummary: win rate is won over decided, drafts are not quoted", () => {
  const quotations = [
    quote({ status: "accepted" }),
    quote({ id: "q2", status: "rejected" }),
    quote({ id: "q3", status: "sent" }),
    quote({ id: "q4", status: "draft" }),
    quote({ id: "q5", status: "invoiced", issueDate: ago(60) }),
  ]
  const s = anu.salesSummary({ quotations, enquiries: [] }, 30, ALL, NOW)
  assert.equal(s.quotations_sent, 3)
  assert.equal(s.won, 1)
  assert.equal(s.win_rate, "50%")
  assert.equal(s.drafts_not_sent, 1)
})

test("draftLines prices from the catalogue, lifts to MOQ, and keeps unmatched items unpriced", () => {
  const products = [
    { id: "p1", name: "Satin Lanyard", category: "Lanyards", material: "Satin", sku: "LY-1", basePrice: 18, gstRate: 12, hsn: "6307", unit: "pcs", moq: 100, status: "active" },
    { id: "p2", name: "Old Lanyard", category: "Lanyards", basePrice: 5, status: "archived" },
  ]
  const { lines, unmatched } = anu.draftLines(products, [
    { product: "satin lanyard", quantity: "50" },
    { product: "glass trophy", quantity: "20" },
  ])
  assert.equal(lines[0].productId, "p1")
  assert.equal(lines[0].rate, 18)
  assert.equal(lines[0].quantity, 100)
  assert.equal(lines[0].gstRate, 12)
  assert.equal(lines[1].rate, 0)
  assert.equal(lines[1].quantity, 20)
  assert.deepEqual(unmatched, ["glass trophy"])
})

test("findProducts never offers an archived product", () => {
  const products = [
    { id: "p1", name: "Satin Lanyard", basePrice: 18, gstRate: 18, status: "active" },
    { id: "p2", name: "Nylon Lanyard", basePrice: 12, gstRate: 18, status: "archived" },
  ]
  const hits = anu.findProducts(products, "lanyard")
  assert.deepEqual(hits.map((h) => h.id), ["p1"])
  assert.match(hits[0].price_incl_gst, /21/)
})
