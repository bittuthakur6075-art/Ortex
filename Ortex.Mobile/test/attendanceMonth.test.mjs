// The Zoho People month list, the pure half (src/features/attendance/month.ts):
// which days are worked rows, which are tinted bands, and where a worked span
// sits on the shift's timeline bar.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { monthEntries } = await loadTs("features/attendance/month.ts")

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
  assert.equal(by["2026-09-06"].label, "Weekly off")
  assert.equal(by["2026-09-07"].label, "Holiday: Test Day")
  assert.equal(by["2026-09-08"].kind, "empty")
})

test("a present-by-default day with no punch is a band, not an empty timeline", () => {
  const row = { user_id: "u", day: "2026-09-03", status: "P", worked_min: 540, flags: ["auto_present"] }
  const e = monthEntries(bounds, [row], [], "2026-09-03")
  assert.equal(e[0].kind, "band")
  assert.equal(e[0].label, "Present by default")
})

test("the weekly off follows the setting, not every Sunday", () => {
  // 2026-09-05 is a Saturday, 2026-09-06 a Sunday.
  const e = monthEntries(bounds, [], [], "2026-09-06", [6])
  const by = Object.fromEntries(e.map((x) => [x.day, x]))
  assert.equal(by["2026-09-05"].label, "Weekly off")
  assert.equal(by["2026-09-06"].kind, "empty")
})
