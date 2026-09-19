// The Zoho People month list, the pure half (src/features/attendance/month.ts):
// which days are worked rows, which are tinted bands, and where a worked span
// sits on the shift's timeline bar.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { monthEntries, spanOnShift } = await loadTs("features/attendance/month.ts")

const bounds = { from: "2026-09-01", to: "2026-09-30" }
const row = (day, status, extra = {}) => ({ user_id: "u", day, status, worked_min: 0, ...extra })

test("lists the month from today back to the 1st, newest first", () => {
  const e = monthEntries(bounds, [], [], "2026-09-05")
  assert.deepEqual(
    e.map((x) => x.day),
    ["2026-09-05", "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01"],
  )
})

test("a worked day is a timeline row; an absent day with no punch is a band", () => {
  const e = monthEntries(
    bounds,
    [
      row("2026-09-03", "P", { first_in: "2026-09-03T04:00:00Z", last_out: "2026-09-03T13:00:00Z", worked_min: 540 }),
      row("2026-09-02", "A"),
      row("2026-09-01", "L"),
    ],
    [],
    "2026-09-03",
  )
  assert.equal(e[0].kind, "worked")
  assert.equal(e[1].kind, "band")
  assert.equal(e[1].label, "Absent")
  assert.equal(e[2].label, "Leave")
})

test("a Sunday and a listed holiday read as what they are even without a row", () => {
  // 2026-09-06 is a Sunday.
  const e = monthEntries(bounds, [], [{ day: "2026-09-07", name: "Test Day" }], "2026-09-08")
  const by = Object.fromEntries(e.map((x) => [x.day, x]))
  assert.equal(by["2026-09-06"].kind, "band")
  assert.equal(by["2026-09-06"].label, "Weekend")
  assert.equal(by["2026-09-07"].label, "Holiday: Test Day")
  assert.equal(by["2026-09-08"].kind, "empty")
})

test("a worked span sits on the shift axis, widened for a late check-out", () => {
  const s = { shift: { start: "09:30", end: "18:30" } }
  // 10:30 to 18:30 IST on a 9:30 to 18:30 shift: starts 1/9 in, runs to the end.
  const a = spanOnShift("2026-09-03", "2026-09-03T05:00:00Z", "2026-09-03T13:00:00Z", s, 0)
  assert.ok(Math.abs(a.left - 1 / 9) < 1e-9)
  assert.ok(Math.abs(a.left + a.width - 1) < 1e-9)
  assert.equal(a.open, false)
  // Out at 20:30 IST: the axis stretches to 11 h and the span ends at its edge.
  const b = spanOnShift("2026-09-03", "2026-09-03T04:00:00Z", "2026-09-03T15:00:00Z", s, 0)
  assert.equal(b.left, 0)
  assert.ok(Math.abs(b.width - 1) < 1e-9)
  assert.equal(spanOnShift("2026-09-03", null, null, s, 0), null)
})
