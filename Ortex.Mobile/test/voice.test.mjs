// Voice-lead folding.
//
// Anu calls `capture_lead` every time the picture firms up during a call, and
// each capture is a separate INSERT into `enquiries`. Showing them raw
// triple-counts the pipeline and invites three people to ring the same
// customer, so rows are folded into calls. This is the behaviour that fold
// depends on, ported from Ortex.Admin/src/pages/voice-leads/helpers.js.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { VOICE_SOURCE, buildQuotationPrefill, itemsFor, parseMessage, parseQuantity, phoneKey, voiceCallsFrom } =
  await loadTs("domain/voice.ts")

const MINUTE = 60 * 1000
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * MINUTE).toISOString()

const row = (overrides) => ({
  id: overrides.id,
  source: VOICE_SOURCE,
  status: "new",
  customer: { name: "Ravi Kumar", phone: "9876543210", company: "", email: "", address: "" },
  productInterest: "",
  message: "",
  ...overrides,
})

test("the message string unpacks back into its own fields", () => {
  const parsed = parseMessage("Wants school boards · Qty: 500 · Timeline: next month · Items: 500 x Boards")
  assert.equal(parsed.summary, "Wants school boards")
  assert.equal(parsed.quantity, "500")
  assert.equal(parsed.timeline, "next month")
  assert.equal(parsed.itemsLine, "500 x Boards")
})

test("a row saved before those suffixes existed is all summary, no invented fields", () => {
  const parsed = parseMessage("Just a plain note")
  assert.equal(parsed.summary, "Just a plain note")
  assert.equal(parsed.quantity, "")
  assert.equal(parsed.timeline, "")
})

test("spoken quantities become numbers, and prose stays null", () => {
  assert.equal(parseQuantity("1000"), 1000)
  assert.equal(parseQuantity("2 crore"), 20000000)
  assert.equal(parseQuantity("90 lakhs total"), 9000000)
  assert.equal(parseQuantity("Not specified, assuming MOQ"), null)
  assert.equal(parseQuantity(""), null)
})

test("the same caller is recognised however the number was stored", () => {
  assert.equal(phoneKey("9876543210"), "9876543210")
  assert.equal(phoneKey("+91 98765 43210"), "9876543210")
  assert.equal(phoneKey("09876543210"), "9876543210")
})

test("a structured items array wins over the legacy fallbacks", () => {
  const items = itemsFor({
    items: [{ product: "Boards", quantity: "500", notes: "A4" }],
    productInterest: "Something else",
    itemsLine: "9 x Ignored",
  })
  assert.deepEqual(items, [{ product: "Boards", quantity: "500", notes: "A4" }])
})

test("a legacy row rebuilds a one-line list from productInterest", () => {
  const items = itemsFor({ productInterest: "Exam boards", quantity: "500" })
  assert.deepEqual(items, [{ product: "Exam boards", quantity: "500", notes: "" }])
})

test("several captures inside the session gap fold into ONE call", () => {
  const calls = voiceCallsFrom([
    row({ id: "c", createdAt: at(1), productInterest: "Exam boards", message: "Firm order · Qty: 500" }),
    row({ id: "b", createdAt: at(6), productInterest: "Exam boards", message: "Maybe boards · Qty: 300" }),
    row({ id: "a", createdAt: at(12), productInterest: "Boards", message: "Enquiring" }),
  ])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].captures, 3)
  // The newest capture is the truth.
  assert.equal(calls[0].quantity, "500")
  assert.equal(calls[0].summary, "Firm order")
})

test("captures beyond the 45-minute gap are separate calls, numbered per caller", () => {
  const calls = voiceCallsFrom([
    row({ id: "later", createdAt: at(5) }),
    row({ id: "earlier", createdAt: at(200) }),
  ])
  assert.equal(calls.length, 2)
  // Newest first, but "Call 2 of 2" means the second time they rang.
  assert.equal(calls[0].callIndex, 2)
  assert.equal(calls[0].callTotal, 2)
  assert.equal(calls[1].callIndex, 1)
})

test("two different callers never fold together", () => {
  const calls = voiceCallsFrom([
    row({ id: "x", createdAt: at(1) }),
    row({ id: "y", createdAt: at(2), customer: { name: "Asha", phone: "9000000001" } }),
  ])
  assert.equal(calls.length, 2)
})

test("rows that are not from the voice assistant are ignored entirely", () => {
  const calls = voiceCallsFrom([row({ id: "web", createdAt: at(1), source: "Website contact form" })])
  assert.equal(calls.length, 0)
})

test("a cancellation is flagged as support, not as buying intent", () => {
  const [call] = voiceCallsFrom([
    row({ id: "s", createdAt: at(1), message: "Wants to cancel the order and complain about delivery" }),
  ])
  assert.equal(call.flags.support, true)
})

test("an item with no quantity marks the call as not yet quotable", () => {
  const [call] = voiceCallsFrom([
    row({ id: "i", createdAt: at(1), items: [{ product: "Boards", quantity: "", notes: "" }] }),
  ])
  assert.equal(call.flags.incomplete, true)
})

test("filler names are not presented as real names", () => {
  const [call] = voiceCallsFrom([row({ id: "n", createdAt: at(1), customer: { name: "customer", phone: "9876543210" } })])
  assert.equal(call.named, false)
  assert.equal(call.name, "Unnamed caller")
})

test("the quotation prefill carries one line per item, priced at zero", () => {
  const [call] = voiceCallsFrom([
    row({
      id: "q",
      createdAt: at(1),
      items: [
        { product: "Exam boards", quantity: "500", notes: "A4" },
        { product: "Lanyards", quantity: "1200", notes: "" },
      ],
    }),
  ])
  const prefill = buildQuotationPrefill(call)
  assert.equal(prefill.lines.length, 2)
  assert.equal(prefill.lines[0].description, "Exam boards, A4")
  assert.equal(prefill.lines[0].quantity, 500)
  assert.equal(prefill.lines[1].quantity, 1200)
  // A voice call never produces a price worth trusting.
  assert.equal(prefill.lines[0].rate, 0)
  assert.equal(prefill.enquiryId, "q")
})

test("an unnamed caller does not put filler into the quotation's customer name", () => {
  const [call] = voiceCallsFrom([row({ id: "u", createdAt: at(1), customer: { name: "sir", phone: "9876543210" } })])
  assert.equal(buildQuotationPrefill(call).customer.name, "")
})
