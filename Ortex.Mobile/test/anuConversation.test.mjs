// Anu for staff: the typed-and-spoken conversation (src/domain/anuConversation.ts).
//
// The things worth pinning are the ones a rep would notice on the screen: their
// typed question showing twice, a status change card naming the wrong lead, a
// "For you" row offering something that is not there.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const c = await loadTs("domain/anuConversation.ts")

const NOW = new Date("2026-09-14T10:00:00.000Z").getTime()
const DAY = 86400000

test("appendTurn numbers turns and ignores empty lines", () => {
  let turns = c.appendTurn([], { role: "user", text: "  Is mahine ki sales?  ", typed: true }, NOW)
  turns = c.appendTurn(turns, { role: "anu", text: "   " }, NOW)
  turns = c.appendTurn(turns, { role: "anu", text: "Is mahine 4 lakh quote hua hai." }, NOW + 1000)
  assert.deepEqual(turns.map((t) => [t.id, t.role, t.text]), [
    [1, "user", "Is mahine ki sales?"],
    [2, "anu", "Is mahine 4 lakh quote hua hai."],
  ])
  assert.equal(turns[0].typed, true)
})

test("a spoken echo of a typed question is dropped, inside the window only", () => {
  const typed = c.appendTurn([], { role: "user", text: "Sharma ka quote dikhao", typed: true }, NOW)
  assert.equal(c.appendTurn(typed, { role: "user", text: "sharma ka quote dikhao." }, NOW + 2000).length, 1)
  assert.equal(c.appendTurn(typed, { role: "user", text: "quote dikhao" }, NOW + 2000).length, 1, "a partial echo too")
  assert.equal(c.appendTurn(typed, { role: "user", text: "quote dikhao" }, NOW + c.ECHO_WINDOW_MS + 1).length, 2, "outside the window it is a new turn")
  assert.equal(c.appendTurn(typed, { role: "user", text: "Aur Verma ka bhi" }, NOW + 2000).length, 2)
})

test("the same line from the same speaker twice in a row is shown once; tool steps always land", () => {
  let turns = c.appendTurn([], { role: "anu", text: "Ek second." }, NOW)
  turns = c.appendTurn(turns, { role: "anu", text: "Ek second" }, NOW + 10)
  assert.equal(turns.length, 1)
  turns = c.appendTurn(turns, { role: "tool", text: "Searched customers", tool: "find_customers" }, NOW + 20)
  turns = c.appendTurn(turns, { role: "tool", text: "Searched customers", tool: "find_customers" }, NOW + 30)
  assert.equal(turns.length, 3)
})

test("appendTurn keeps only the newest MAX_TURNS with rising ids", () => {
  let turns = []
  for (let i = 0; i < c.MAX_TURNS + 5; i++) turns = c.appendTurn(turns, { role: "tool", text: `step ${i}` }, NOW + i)
  assert.equal(turns.length, c.MAX_TURNS)
  assert.equal(turns.at(-1).id, c.MAX_TURNS + 5)
  assert.equal(turns[0].text, "step 5")
})

test("cardFor names the record and flags support calls; cardsFrom drops duplicates", () => {
  const call = { id: "v1", kind: "voice_call", caller: "Ravi", wants: "500 lanyards", status: "New", support: true }
  assert.deepEqual(c.cardFor(call), { key: "voice_call:v1", kind: "voice_call", id: "v1", title: "Ravi", subtitle: "500 lanyards · New", flag: "support" })
  assert.equal(c.cardFor({ id: "q7", kind: "quotation", number: "QT-7", customer: "Sharma", status: "Sent", value: "₹10" }).title, "Quotation QT-7")
  assert.equal(c.cardFor({ id: "x" }), null)
  const cards = c.cardsFrom([call, call, { id: "c1", kind: "customer", name: "Asha", company: "none", phone: "not recorded" }])
  assert.equal(cards.length, 2)
  assert.equal(cards[1].subtitle, "")
})

test("activityLabel says what a step did, and whether a write was only proposed", () => {
  assert.equal(c.activityLabel("find_enquiries", { query: "Sharma", status: "new", days: 7 }), 'Searched leads for "Sharma", new, last 7 days')
  assert.equal(c.activityLabel("set_enquiry_status", { confirmed: false }), "Proposed a status change")
  assert.equal(c.activityLabel("start_quotation", { confirmed: true }), "Started a draft quotation")
  assert.equal(c.activityLabel("end_call"), "")
})

test("stats read the briefing and the summary without inventing figures", () => {
  assert.deepEqual(c.briefingStats({ new_enquiries: { count: 3 }, quotations: { open_pipeline_value: "₹48,000" } }), [
    { label: "New enquiries", value: "3" },
    { label: "Open pipeline", value: "₹48,000" },
  ])
  assert.equal(c.summaryStats({ quoted_value: "₹1", won_value: "₹1", win_rate: "50%", website_enquiries: 0, anu_calls: 2 }).length, 4)
  assert.deepEqual(c.summaryStats({ period: "x" }), [])
})

test("attentionCounts and forYouRows offer only what is there, most urgent first", () => {
  const enquiries = [
    { id: "e1", source: "website", status: "new", createdAt: new Date(NOW - DAY).toISOString(), customer: { name: "A" } },
    { id: "e2", source: "website", status: "contacted", createdAt: new Date(NOW - DAY).toISOString(), customer: { name: "B" } },
  ]
  const quotations = [
    { id: "q1", number: "QT-1", status: "sent", customer: { name: "S" }, issueDate: new Date(NOW - 2 * DAY).toISOString(), validUntil: new Date(NOW + DAY).toISOString(), totals: { grandTotal: 100 } },
    { id: "q2", number: "QT-2", status: "sent", customer: { name: "T" }, issueDate: new Date(NOW - 9 * DAY).toISOString(), validUntil: new Date(NOW + 20 * DAY).toISOString(), totals: { grandTotal: 100 } },
  ]
  const all = { enquiries: true, voice: true, quotations: true, customers: true, products: true }
  const counts = c.attentionCounts({ enquiries, quotations }, all, NOW)
  assert.deepEqual(counts, { newEnquiries: 1, callsToReturn: 0, support: 0, expiring: 1, waiting: 1 })
  assert.deepEqual(c.forYouRows(counts).map((r) => r.key), ["enquiries", "expiring", "waiting"])
  assert.equal(c.forYouRows(counts)[0].text, "1 new enquiry waiting")

  const none = c.attentionCounts({ enquiries, quotations }, { ...all, enquiries: false, voice: false, quotations: false }, NOW)
  assert.deepEqual(c.forYouRows(none), [])

  const urgent = c.forYouRows({ newEnquiries: 2, callsToReturn: 3, support: 1, expiring: 0, waiting: 0 })
  assert.deepEqual(urgent.map((r) => r.key), ["support", "calls", "enquiries"])
  assert.equal(urgent[1].text, "3 Anu calls nobody has returned")
})

test("no on-screen string in the conversation copy carries an em dash", () => {
  const rows = c.forYouRows({ newEnquiries: 1, callsToReturn: 1, support: 1, expiring: 1, waiting: 1 })
  for (const r of rows) assert.doesNotMatch(r.text + r.ask, /—/)
})

test("pendingActionFor names the lead and the items, and ignores reads", () => {
  const known = new Map([["enquiry:e1", { key: "enquiry:e1", kind: "enquiry", id: "e1", title: "Sharma Traders", subtitle: "Lanyards · New", flag: "" }]])
  const p = c.pendingActionFor("set_enquiry_status", { id: "e1", kind: "enquiry", status: "contacted" }, known)
  assert.equal(p.title, "Mark as Contacted")
  assert.equal(p.detail, "Sharma Traders · Lanyards · New")
  assert.equal(c.pendingActionFor("set_enquiry_status", { id: "zz", kind: "voice_call", status: "won" }, known).detail, "An Anu call")
  assert.equal(c.pendingActionFor("set_enquiry_status", { id: "e1", kind: "enquiry", status: "bogus" }, known), null)

  const q = c.pendingActionFor("start_quotation", { customer_name: "Verma", items: [{ product: "Satin lanyard", quantity: "500" }, { product: "ID card" }] }, known)
  assert.equal(q.detail, "Verma · 500 x Satin lanyard, ID card")
  assert.equal(c.pendingActionFor("start_quotation", { items: [] }, {}).detail, "No customer named")
  assert.equal(c.pendingActionFor("find_products", {}, known), null)
})

test("openingLine carries a typed question, or asks for a greeting", () => {
  assert.match(c.openingLine("Louis", " Pending quotes? "), /Louis opened Anu and asks.*\] Pending quotes\?$/)
  assert.match(c.openingLine("Louis"), /Greet them/)
  assert.match(c.confirmedLine("Louis", { ok: true }), /pressed Confirm.*\{"ok":true\}/)
})
