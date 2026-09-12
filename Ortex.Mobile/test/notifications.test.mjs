// The notification feed.
//
// It is derived, not stored: a notification is a view of the enquiries and
// quotations the app already holds (src/domain/notifications.ts). Everything
// worth asserting is therefore pure — what becomes a signal, what does not, what
// a rep can do about it from the shade, and the ids that stop the same lead
// being announced twice.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { buildNotifications, DEFAULT_PREFS } = await loadTs("domain/notifications.ts")
const { VOICE_SOURCE } = await loadTs("domain/voice.ts")

const NOW = new Date("2026-09-12T10:00:00.000Z").getTime()
const DAY = 86400000
const ago = (days) => new Date(NOW - days * DAY).toISOString()
const inDays = (days) => new Date(NOW + days * DAY).toISOString()

const customer = (over = {}) => ({
  name: "Ravi Kumar",
  company: "",
  email: "",
  phone: "9876543210",
  gstin: "",
  stateCode: "",
  address: "Jaipur, Rajasthan",
  ...over,
})

const enquiry = (over = {}) => ({
  id: "e1",
  createdAt: ago(0),
  customer: customer(),
  source: "Website form",
  productInterest: "MDF name boards",
  message: "",
  status: "new",
  starred: false,
  owner: "",
  notes: "",
  ...over,
})

const quotation = (over = {}) => ({
  id: "q1",
  number: "QTN-0007",
  status: "sent",
  customer: customer(),
  shipTo: null,
  lines: [{ description: "Lanyards", quantity: 500, rate: 40 }],
  totals: { grandTotal: 23600 },
  validUntil: inDays(2),
  ...over,
})

const build = (input) => buildNotifications({ now: NOW, prefs: DEFAULT_PREFS, ...input })

test("a new enquiry becomes one notification a rep can act on", () => {
  const [n] = build({ enquiries: [enquiry()] })
  assert.equal(n.kind, "enquiry-new")
  assert.equal(n.target.screen, "EnquiryDetail")
  assert.equal(n.target.id, "e1")
  assert.match(n.title, /Ravi Kumar/)
  // Ring, message, open — in that order, because that is the order a rep uses.
  assert.deepEqual(
    n.actions.map((a) => a.id),
    ["call", "whatsapp", "open"],
  )
  assert.equal(n.phone, "9876543210")
  // The push says what they want, not just that something happened.
  assert.match(n.push.body, /MDF name boards/)
})

test("a lead with no number is never offered a dead Call button", () => {
  const [n] = build({ enquiries: [enquiry({ customer: customer({ phone: "" }) })] })
  assert.deepEqual(
    n.actions.map((a) => a.id),
    ["open"],
  )
  assert.equal(n.phone, "")
})

test("+91 and trunk-0 numbers are normalised to the 10 digits tel: needs", () => {
  const [a] = build({ enquiries: [enquiry({ customer: customer({ phone: "+91 98765 43210" }) })] })
  const [b] = build({ enquiries: [enquiry({ customer: customer({ phone: "09876543210" }) })] })
  assert.equal(a.phone, "9876543210")
  assert.equal(b.phone, "9876543210")
})

test("an answered enquiry stops being news", () => {
  assert.equal(build({ enquiries: [enquiry({ status: "quoted" })] }).length, 0)
})

test("an enquiry still new after two days asks again, urgently", () => {
  const feed = build({ enquiries: [enquiry({ createdAt: ago(3) })] })
  const stale = feed.find((n) => n.kind === "enquiry-stale")
  assert.ok(stale, "expected a cold-enquiry notification")
  assert.equal(stale.urgent, true)
  assert.match(stale.body, /3 days ago/)
})

test("a fortnight-old enquiry is a list, not a notification", () => {
  assert.equal(build({ enquiries: [enquiry({ createdAt: ago(20) })] }).length, 0)
})

test("three captures of one call are ONE notification, not three", () => {
  const rows = ["v1", "v2", "v3"].map((id, i) =>
    enquiry({
      id,
      source: VOICE_SOURCE,
      createdAt: new Date(NOW - (10 - i) * 60000).toISOString(),
      message: `Wants lanyards · Qty: ${500 + i} · Timeline: next week`,
    }),
  )
  const feed = build({ enquiries: rows })
  const voice = feed.filter((n) => n.kind.startsWith("voice"))
  assert.equal(voice.length, 1)
  assert.equal(voice[0].target.screen, "VoiceCallDetail")
})

test("a complaint is flagged as support, not pitched as a sale", () => {
  const feed = build({
    enquiries: [
      enquiry({
        id: "v9",
        source: VOICE_SOURCE,
        message: "Wants to cancel the order, very angry about the delay",
      }),
    ],
  })
  const n = feed.find((x) => x.kind === "voice-support")
  assert.ok(n, "expected the call to be flagged as support")
  assert.equal(n.tone, "rose")
  assert.equal(n.urgent, true)
  assert.match(n.push.title, /Complaint/)
  assert.match(n.body, /Support, not a sale/)
})

test("a sent quotation warns before it expires and again after", () => {
  const [soon] = build({ quotations: [quotation()] })
  assert.equal(soon.kind, "quotation-expiring")
  assert.match(soon.title, /expires in 2 days/)
  assert.equal(soon.value, 23600)

  const [gone] = build({ quotations: [quotation({ validUntil: ago(1) })] })
  assert.equal(gone.kind, "quotation-expired")
  assert.equal(gone.urgent, true)
  assert.match(gone.title, /expired 1 day ago/)
})

test("a draft quotation, and one valid for weeks, say nothing", () => {
  assert.equal(build({ quotations: [quotation({ status: "draft" })] }).length, 0)
  assert.equal(build({ quotations: [quotation({ validUntil: inDays(30) })] }).length, 0)
})

test("extending a quotation retires the old warning rather than leaving it read", () => {
  const [before] = build({ quotations: [quotation()] })
  const [after] = build({ quotations: [quotation({ validUntil: inDays(3) })] })
  assert.notEqual(before.id, after.id)
})

test("ids are deterministic, so nothing is announced twice", () => {
  const input = { enquiries: [enquiry()], quotations: [quotation()] }
  assert.deepEqual(
    build(input).map((n) => n.id),
    build(input).map((n) => n.id),
  )
})

test("a switched-off signal produces nothing, and the master switch silences all", () => {
  const input = { enquiries: [enquiry()], quotations: [quotation()] }
  const noQuotes = buildNotifications({
    ...input,
    now: NOW,
    prefs: { ...DEFAULT_PREFS, quotations: false },
  })
  assert.ok(noQuotes.every((n) => !n.kind.startsWith("quotation")))
  assert.equal(
    buildNotifications({ ...input, now: NOW, prefs: { ...DEFAULT_PREFS, enabled: false } }).length,
    0,
  )
})

test("the feed is newest first", () => {
  const feed = build({
    enquiries: [enquiry({ id: "old", createdAt: ago(5) }), enquiry({ id: "new", createdAt: ago(0) })],
  })
  const stamps = feed.map((n) => new Date(n.when).getTime())
  assert.deepEqual([...stamps].sort((a, b) => b - a), stamps)
})
