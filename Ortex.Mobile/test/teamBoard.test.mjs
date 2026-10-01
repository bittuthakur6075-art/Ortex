// Team attendance, the pure half (src/features/attendance/teamBoard.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const b = await loadTs("features/attendance/teamBoard.ts")

const day = "2026-10-01"
const ist = (hh, mm) =>
  new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`).toISOString()
const sum = (over = {}) => ({
  day,
  firstIn: null,
  lastOut: null,
  workedMin: 0,
  open: false,
  punches: [],
  flagged: 0,
  field: false,
  site: null,
  ...over,
})
const person = (name, over = {}) => ({
  userId: name,
  name,
  avatarUrl: "",
  phone: "",
  summary: sum(),
  onDuty: false,
  leave: null,
  autoPresent: false,
  ...over,
})
const rules = (hh, mm, over = {}) => ({
  day,
  now: Date.parse(ist(hh, mm)),
  shiftStart: "09:30",
  graceMin: 15,
  off: null,
  ...over,
})

test("status: punches, leave, off day, auto-present, expected, overdue", () => {
  const r = rules(11, 0)
  assert.equal(
    b.boardRow(person("a", { summary: sum({ firstIn: ist(9, 40), workedMin: 80 }), onDuty: true }), r).status,
    "working",
  )
  assert.equal(
    b.boardRow(person("b", { summary: sum({ firstIn: ist(9, 40), lastOut: ist(10, 40) }) }), r).status,
    "done",
  )
  assert.equal(b.boardRow(person("c", { leave: { code: "CL", half: false } }), r).status, "leave")
  assert.equal(b.boardRow(person("d", { autoPresent: true }), r).status, "auto")
  assert.equal(b.boardRow(person("e"), r).status, "notIn")
  assert.equal(b.boardRow(person("e"), rules(9, 40)).status, "expected")
  assert.equal(b.boardRow(person("e"), rules(11, 0, { off: "Weekly off" })).status, "off")
})

test("late only past the grace, counted from the shift start, never on a day off", () => {
  const late = person("a", { summary: sum({ firstIn: ist(9, 50) }), onDuty: true })
  assert.equal(b.boardRow(late, rules(11, 0)).lateMin, 20)
  assert.equal(
    b.boardRow(person("a", { summary: sum({ firstIn: ist(9, 44) }), onDuty: true }), rules(11, 0)).lateMin,
    0,
  )
  assert.equal(b.boardRow(late, rules(11, 0, { off: "Diwali" })).lateMin, 0)
})

test("sections in acting order; overdue before expected; counts", () => {
  const r = rules(9, 40)
  const rows = [
    person("Zed"),
    person("Amy", { summary: sum({ firstIn: ist(9, 50) }), onDuty: true }),
    person("Bob", { leave: { code: "SL", half: true } }),
  ].map((p) => b.boardRow(p, { ...r, now: Date.parse(ist(9, 50)) }))
  rows.push(b.boardRow(person("Cat"), r))
  const s = b.boardSections(rows)
  assert.deepEqual(
    s.map((x) => x.key),
    ["notIn", "working", "leave"],
  )
  assert.deepEqual(
    s[0].data.map((x) => x.name),
    ["Zed", "Cat"],
  )
  const c = b.boardCounts(rows)
  assert.equal(c.present, 1)
  assert.equal(c.notIn, 1)
  assert.equal(c.expected, 1)
  assert.equal(c.late, 1)
  assert.equal(c.leave, 1)
})
