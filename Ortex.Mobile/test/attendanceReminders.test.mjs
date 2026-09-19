// Which clock-in / clock-out reminders get scheduled
// (src/features/attendance/reminderPlan.ts): working days only, never on a
// weekly off, a holiday or a day of approved leave, and half days of leave
// move the reminder to the half being worked.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { planReminders, istAt, istDay } = await loadTs("features/attendance/reminderPlan.ts")

// Mon 21 Sep 2026, 08:00 IST.
const NOW = istAt("2026-09-21", 8 * 60)
const RULES = { shiftStart: "09:30", shiftEnd: "18:30", graceMin: 15, weeklyOff: [0] }
const days = (plan, kind) => plan.filter((r) => r.kind === kind).map((r) => r.day)

test("IST helpers round-trip", () => {
  assert.equal(istDay(NOW), "2026-09-21")
  assert.equal(new Date(istAt("2026-09-21", 9 * 60 + 50)).toISOString(), "2026-09-21T04:20:00.000Z")
})

test("seven days ahead, weekly off skipped, clock-in after grace + 5", () => {
  const plan = planReminders(RULES, NOW)
  // Mon 21 to Sun 27: six working days.
  assert.deepEqual(days(plan, "in"), ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"])
  const first = plan.find((r) => r.kind === "in")
  assert.equal(first.at, istAt("2026-09-21", 9 * 60 + 30 + 20))
  const out = plan.find((r) => r.kind === "out")
  assert.equal(out.at, istAt("2026-09-21", 18 * 60 + 30))
})

test("reminders already in the past today are not planned", () => {
  const plan = planReminders(RULES, istAt("2026-09-21", 12 * 60))
  assert.equal(days(plan, "in")[0], "2026-09-22")
  assert.equal(days(plan, "out")[0], "2026-09-21")
})

test("holidays and full days of leave are skipped", () => {
  const plan = planReminders(
    { ...RULES, holidays: ["2026-09-22"], leave: [{ from: "2026-09-23", to: "2026-09-24" }] },
    NOW,
  )
  assert.deepEqual(days(plan, "in"), ["2026-09-21", "2026-09-25", "2026-09-26"])
})

test("half-day leave moves the reminder to the worked half; half Saturdays end early", () => {
  const plan = planReminders(
    {
      ...RULES,
      saturday: "half",
      leave: [
        { from: "2026-09-22", to: "2026-09-22", fromHalf: "full", toHalf: "first" }, // morning off
        { from: "2026-09-23", to: "2026-09-23", fromHalf: "second", toHalf: "full" }, // afternoon off
      ],
    },
    NOW,
  )
  const at = (kind, day) => plan.find((r) => r.kind === kind && r.day === day)?.at
  // Morning off: work from the midpoint (14:00), reminder at 14:20.
  assert.equal(at("in", "2026-09-22"), istAt("2026-09-22", 14 * 60 + 20))
  // Afternoon off: work the morning, clock out at the midpoint.
  assert.equal(at("out", "2026-09-23"), istAt("2026-09-23", 14 * 60))
  // Saturday half day: 09:30 + 4h30 = 14:00.
  assert.equal(at("out", "2026-09-26"), istAt("2026-09-26", 14 * 60))
})
