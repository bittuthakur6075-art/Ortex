// Grouping on the Quotations and Leads tabs: what needs doing first, then the
// recent rows, then the rest (src/domain/lists.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const L = await loadTs("domain/lists.ts")
const now = Date.parse("2026-09-27T12:00:00+05:30")
const DAY = 86400000
const iso = (t) => new Date(t).toISOString()

const q = (id, status, created, validIn, total = 1000, issued) => ({
  id,
  status,
  createdAt: iso(now - created * DAY),
  issueDate: issued ?? iso(now - created * DAY).slice(0, 10),
  validUntil: validIn == null ? "" : iso(now + validIn * DAY),
  totals: { grandTotal: total },
})

test("quotes: expiring first (soonest first), then this week, then earlier", () => {
  const list = [
    q("old", "sent", 20, 10),
    q("exp3", "sent", 12, 3),
    q("exp1", "sent", 8, 1),
    q("lapsed", "sent", 30, -1),
    q("draftSoon", "draft", 2, 1),
    q("new", "draft", 1, null),
  ]
  const s = L.quoteSections(list, now)
  assert.deepEqual(s.map((x) => x.title), ["Expiring Soon", "This Week", "Earlier"])
  assert.deepEqual(s[0].data.map((x) => x.id), ["exp1", "exp3"])
  assert.deepEqual(s[1].data.map((x) => x.id), ["new", "draftSoon"])
  assert.deepEqual(s[2].data.map((x) => x.id), ["old", "lapsed"])
})

test("quotes: empty groups are dropped", () => {
  assert.deepEqual(L.quoteSections([q("a", "draft", 1, null)], now).map((x) => x.key), ["recent"])
})

test("quote summary: open value, expiring, won this month", () => {
  const s = L.quoteSummary(
    [q("a", "sent", 1, 2, 500), q("b", "draft", 1, null, 250), q("c", "accepted", 3, null, 900), q("d", "invoiced", 40, null, 700, "2026-08-10"), q("e", "rejected", 1, null, 50)],
    now,
  )
  assert.deepEqual(s, { openValue: 750, openCount: 2, expiring: 1, wonValue: 900, wonCount: 1 })
})

test("enquiries: new and due follow-ups go first, won and lost close the list", () => {
  const e = (id, status, hoursAgo, followUpAt) => ({ id, status, createdAt: iso(now - hoursAgo * 3600000), followUpAt })
  const s = L.enquirySections(
    [
      e("stale", "new", 60),
      e("worked", "contacted", 90),
      e("fresh", "new", 2),
      e("ancient", "new", 24 * 60),
      e("due", "quoted", 200, iso(now - DAY)),
      e("dueToday", "contacted", 3, iso(now + 3600000)),
      e("snoozed", "new", 1, iso(now + 3 * DAY)),
      e("won", "won", 1),
      e("lost", "lost", 100, iso(now - DAY)),
    ],
    now,
  )
  assert.deepEqual(s.map((x) => [x.title, x.data.map((d) => d.id)]), [
    ["Call First", ["fresh", "dueToday", "stale", "due"]],
    ["Today", ["snoozed"]],
    ["Earlier", ["worked", "ancient"]],
    ["Closed", ["won", "lost"]],
  ])
})

test("call first labels", () => {
  assert.equal(L.callFirstLabel("new", iso(now - 3 * DAY), {}, now), "Overdue")
  assert.equal(L.callFirstLabel("new", iso(now - 3600000), {}, now), "New")
  assert.equal(L.callFirstLabel("contacted", iso(now), { followUpAt: iso(now - 1) }, now), "Follow-up due")
})

test("voice calls: complaints and urgent asks first unless closed", () => {
  const c = (id, status, flags, hoursAgo) => ({ id, status, endedAt: iso(now - hoursAgo * 3600000), flags: { support: false, urgent: false, ...flags } })
  const s = L.callSections(
    [c("sup", "contacted", { support: true }, 30), c("won", "won", { urgent: true }, 1), c("plain", "new", {}, 1), c("worked", "contacted", {}, 2)],
    now,
  )
  assert.deepEqual(s.map((x) => [x.key, x.data.map((d) => d.id)]), [
    ["first", ["plain", "sup"]],
    ["recent", ["worked"]],
    ["closed", ["won"]],
  ])
})

test("initials", () => {
  assert.equal(L.initials("Apex Pharma Ltd"), "AP")
  assert.equal(L.initials("rohit"), "R")
  assert.equal(L.initials(""), "?")
})
