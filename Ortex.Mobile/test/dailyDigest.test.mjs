// The daily motivation and insight notifications (src/domain/dailyDigest.ts).
//
// They fire at 9:00 and 9:30 from a schedule set while the app last ran, so what
// matters is: the right calendar day is reported, the snapshot time is admitted
// when the day was not over, and access decides what may be mentioned.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { dailyInsight, motivationFor, nextAt, MOTIVATION, INSIGHT_AT } = await loadTs("domain/dailyDigest.ts")

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m, 0).getTime()
const iso = (t) => new Date(t).toISOString()
const ALL = { enquiries: true, voice: true, quotations: true }

const enquiry = (over = {}) => ({
  id: "e1",
  createdAt: iso(at(17, 11)),
  customer: { name: "Ravi Kumar", company: "", email: "", phone: "9876543210" },
  source: "Website contact form",
  status: "new",
  ...over,
})
const quote = (over = {}) => ({
  id: "q1",
  number: "QTN-001",
  status: "sent",
  customer: { name: "Asha", company: "Acme", phone: "" },
  totals: { grandTotal: 150000 },
  issueDate: iso(at(17, 15)),
  ...over,
})

test("nextAt is the next occurrence strictly after now", () => {
  assert.equal(nextAt(at(17, 8), INSIGHT_AT), at(17, 9, 30))
  assert.equal(nextAt(at(17, 9, 30), INSIGHT_AT), at(18, 9, 30))
  assert.equal(nextAt(at(17, 20), INSIGHT_AT), at(18, 9, 30))
})

test("reports the day before it fires, and says 'as of' for a day still running", () => {
  const out = dailyInsight({
    enquiries: [enquiry(), enquiry({ id: "e2", createdAt: iso(at(16, 10)) })],
    quotations: [quote()],
    access: ALL,
    now: at(17, 18, 40),
    fireAt: at(18, 9, 30),
  })
  assert.equal(out.figures.leads, 1, "only the 17th's lead")
  assert.equal(out.figures.quoted, 1)
  assert.match(out.body, /^Yesterday \(as of 6:40 PM\): 1 new lead, 1 quotation sent worth /)
})

test("a snapshot taken after the day ended is not marked partial", () => {
  const out = dailyInsight({ enquiries: [enquiry()], quotations: [], access: ALL, now: at(18, 8), fireAt: at(18, 9, 30) })
  assert.match(out.body, /^Yesterday: 1 new lead, no quotations sent\./)
})

test("drafts are not quoted; won quotations are counted with their value", () => {
  const out = dailyInsight({
    enquiries: [],
    quotations: [quote({ id: "d", status: "draft" }), quote({ id: "w", status: "accepted" })],
    access: ALL,
    now: at(18, 8),
    fireAt: at(18, 9, 30),
  })
  assert.equal(out.figures.quoted, 1)
  assert.equal(out.figures.won, 1)
  assert.match(out.body, /1 won, /)
})

test("today's to-dos come from the Home tab's attention list", () => {
  const out = dailyInsight({
    enquiries: [enquiry({ createdAt: iso(at(17, 9)) })],
    quotations: [quote({ id: "x", validUntil: iso(at(19, 12)), issueDate: iso(at(10, 12)) })],
    access: ALL,
    now: at(18, 8),
    fireAt: at(18, 9, 30),
  })
  assert.equal(out.figures.waiting, 1)
  assert.equal(out.figures.expiring, 1)
  assert.match(out.body, /Today: 1 lead waiting for a reply, 1 quote about to expire\./)
})

test("access narrows what is mentioned, and none at all means no insight", () => {
  const quotesOnly = dailyInsight({
    enquiries: [enquiry()],
    quotations: [quote()],
    access: { enquiries: false, voice: false, quotations: true },
    now: at(18, 8),
    fireAt: at(18, 9, 30),
  })
  assert.doesNotMatch(quotesOnly.body, /lead/)
  assert.equal(
    dailyInsight({ access: { enquiries: false, voice: false, quotations: false }, now: at(18, 8), fireAt: at(18, 9, 30) }),
    null,
  )
})

test("an empty day still reads as a sentence, not a blank", () => {
  const out = dailyInsight({ enquiries: [], quotations: [], access: ALL, now: at(18, 8), fireAt: at(18, 9, 30) })
  assert.equal(out.body, "Yesterday: no new leads, no quotations sent. Nothing waiting on you. A good day to follow up.")
})

test("motivation changes day to day, is stable within a day, and never uses an em dash", () => {
  assert.deepEqual(motivationFor(at(17, 9)), motivationFor(at(17, 21)))
  assert.notDeepEqual(motivationFor(at(17, 9)), motivationFor(at(18, 9)))
  for (const line of MOTIVATION) {
    assert.doesNotMatch(line.title + line.body, /—/)
  }
})
