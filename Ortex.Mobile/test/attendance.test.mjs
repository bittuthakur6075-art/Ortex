// Attendance, the pure half: src/domain/attendance.ts and its mirror
// Ortex.Admin/src/lib/attendance.js. Every assertion runs against BOTH, so a
// change to one without the other fails here rather than showing a rep one
// number on the phone and the accountant another on the console.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/attendance.js"))
const mobile = await loadTs("domain/attendance.ts")
const both = [
  ["mobile", mobile],
  ["admin", admin],
]

// 19 Sep 2026 in IST. 09:42 IST = 04:12 UTC.
const ist = (hh, mm, d = 19) => new Date(Date.UTC(2026, 8, d, hh - 5, mm - 30)).toISOString()
const punch = (over) => ({ id: "p", user_id: "u", kind: "in", at: ist(9, 42), day: "2026-09-19", mode: "office", review: "ok", ...over })

for (const [side, a] of both) {
  test(`${side}: IST day and clock regardless of the device zone`, () => {
    assert.equal(a.dayKey(ist(0, 10)), "2026-09-19") // 18:40 UTC the day before
    assert.equal(a.dayKey(ist(23, 50)), "2026-09-19")
    assert.equal(a.clockIST(ist(9, 42)), "9:42 AM")
    assert.equal(a.clockIST(ist(18, 5)), "6:05 PM")
    assert.equal(a.clockIST(ist(0, 7)), "12:07 AM")
  })

  test(`${side}: a day's hours, with a lunch break out and back in`, () => {
    const s = a.summarizeDay("2026-09-19", [
      punch({ id: "4", kind: "out", at: ist(18, 30) }),
      punch({ id: "1", kind: "in", at: ist(9, 30) }),
      punch({ id: "2", kind: "out", at: ist(13, 0) }),
      punch({ id: "3", kind: "in", at: ist(13, 45) }),
    ])
    assert.equal(s.workedMin, 3.5 * 60 + 4.75 * 60)
    assert.equal(s.firstIn, ist(9, 30))
    assert.equal(s.lastOut, ist(18, 30))
    assert.equal(s.open, false)
    assert.equal(a.durationWords(s.workedMin), "8h 15m")
  })

  test(`${side}: an open day counts up to now, and a rejected punch never counts`, () => {
    const s = a.summarizeDay(
      "2026-09-19",
      [punch({ at: ist(9, 0) }), punch({ id: "x", kind: "out", at: ist(10, 0), review: "rejected" })],
      new Date(ist(11, 0)).getTime(),
    )
    assert.equal(s.open, true)
    assert.equal(s.workedMin, 120)
  })

  test(`${side}: on duty since the latest counted in, closed after 20 hours`, () => {
    const list = [punch({ at: ist(9, 0) })]
    assert.equal(a.onDutySince(list, new Date(ist(12, 0)).getTime()), ist(9, 0))
    assert.equal(a.onDutySince(list, new Date(ist(9, 0, 20)).getTime()), null)
    assert.equal(a.onDutySince([...list, punch({ id: "o", kind: "out", at: ist(18, 0) })], new Date(ist(19, 0)).getTime()), null)
  })

  test(`${side}: result sentences state what happened in words`, () => {
    assert.equal(
      a.resultSentence({ status: "ok", kind: "in", at: ist(9, 42), mode: "office", site: "Factory", distanceM: 40 }),
      "Clocked in at 9:42 AM · Factory · 40 m",
    )
    assert.equal(
      a.resultSentence({ status: "flagged", kind: "out", at: ist(18, 5), mode: "field", flags: ["offline"] }),
      "Clocked out at 6:05 PM · Field visit. Sent for review: saved offline",
    )
    assert.equal(a.resultSentence({ status: "outside", message: "You are 190 m from Factory." }), "You are 190 m from Factory.")
  })

  test(`${side}: selfie path is the owner's folder, year and month in IST`, () => {
    assert.equal(a.selfiePath("uid", "pid", new Date(ist(0, 30, 1))), "uid/2026/09/pid.jpg")
    assert.equal(a.metresOutside({ distanceM: 340, radiusM: 150 }), 190)
    assert.equal(a.metresOutside({ distanceM: 90, radiusM: 150 }), 0)
  })
}

for (const [side, a] of both) {
  test(`${side}: month totals and payable days, the database's formula`, () => {
    const d = (day, status, over = {}) => ({ user_id: "u", day, status, worked_min: 480, ...over })
    const days = [
      d("2026-09-01", "P", { late: true }),
      d("2026-09-02", "P", { late: true }),
      d("2026-09-03", "P", { late: true }),
      d("2026-09-04", "HD", { worked_min: 200 }),
      d("2026-09-05", "OD"),
      d("2026-09-06", "WO", { worked_min: 0 }),
      d("2026-09-07", "MP", { worked_min: 0 }),
      d("2026-09-08", "A", { worked_min: 0 }),
      d("2026-09-09", "A", { override_status: "P", worked_min: 0 }),
    ]
    const t = a.monthTotals(days, { count: 3, deductDays: 0.5 })
    // P 4 (one by override) + OD 1 + WO 1 + half of (HD 1 + MP 1) = 7, less 3 lates → 0.5
    assert.equal(t.counts.P, 4)
    assert.equal(t.counts.A, 1)
    assert.equal(t.lates, 3)
    assert.equal(t.latePenalty, 0.5)
    assert.equal(t.payable, 6.5)
    assert.equal(a.effectiveStatus({ status: "A", override_status: "P" }), "P")
  })

  test(`${side}: month grid is Monday-first weeks of seven`, () => {
    const weeks = a.monthGrid(2026, 9, [{ user_id: "u", day: "2026-09-19", status: "P" }])
    assert.ok(weeks.every((w) => w.length === 7))
    // 1 Sep 2026 is a Tuesday: one leading day from August.
    assert.equal(weeks[0][0].day, "2026-08-31")
    assert.equal(weeks[0][0].inMonth, false)
    assert.equal(weeks[0][1].day, "2026-09-01")
    const cell = weeks.flat().find((c) => c.day === "2026-09-19")
    assert.equal(cell.entry.status, "P")
    assert.deepEqual(a.monthBounds(2026, 2), { from: "2026-02-01", to: "2026-02-28", label: "February 2026" })
  })
}

for (const [side, a] of both) {
  test(`${side}: leave days skip weekly offs and holidays; sandwich counts the ones inside`, () => {
    // Fri 18 Sep to Mon 21 Sep 2026; Sunday 20 is the weekly off.
    const rules = { weeklyOff: [0], holidays: [] }
    assert.equal(a.leaveDaysBetween("2026-09-18", "2026-09-21", "full", "full", rules), 3)
    assert.equal(a.leaveDaysBetween("2026-09-18", "2026-09-21", "full", "full", { ...rules, sandwich: true }), 4)
    // A holiday inside the range: Fri 2 Oct 2026.
    assert.equal(a.leaveDaysBetween("2026-10-01", "2026-10-03", "full", "full", { weeklyOff: [0], holidays: ["2026-10-02"] }), 2)
    // Half days at either end.
    assert.equal(a.leaveDaysBetween("2026-09-22", "2026-09-24", "second", "first", rules), 2)
    assert.equal(a.leaveDaysBetween("2026-09-22", "2026-09-22", "second", "full", rules), 0.5)
    // Only off days, or a reversed range: nothing.
    assert.equal(a.leaveDaysBetween("2026-09-20", "2026-09-20", "full", "full", rules), 0)
    assert.equal(a.leaveDaysBetween("2026-09-24", "2026-09-22", "full", "full", rules), 0)
  })

  test(`${side}: balance after a request, and days in words`, () => {
    assert.equal(a.balanceAfter({ available: 5, accrual: "monthly" }, 1.5), 3.5)
    assert.equal(a.balanceAfter({ available: 0, accrual: "none" }, 2), null)
    assert.equal(a.daysWords(1), "1 day")
    assert.equal(a.daysWords(0.5), "0.5 day")
    assert.equal(a.daysWords(4.5), "4.5 days")
  })
}
