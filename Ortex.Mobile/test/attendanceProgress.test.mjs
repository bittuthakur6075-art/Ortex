// The live attendance progress display, the pure half
// (src/features/attendance/progress.ts): shift length, live worked time, the
// day timeline bar and the week strip.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const p = await loadTs("features/attendance/progress.ts")

// 19 Sep 2026 is a Saturday; 18 Sep a Friday. IST hh:mm → ISO.
const ist = (day, hh, mm) => new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`).toISOString()
const punch = (day, kind, hh, mm, over = {}) => ({ id: `${kind}${hh}${mm}`, user_id: "u", kind, at: ist(day, hh, mm), day, mode: "office", review: "ok", ...over })
const S = { shift: { start: "09:30", end: "18:30" }, graceMin: 15 }

test("shift length: settings, half-day Saturday, 9 h default", () => {
  assert.equal(p.shiftMinutes(S, "2026-09-18"), 540)
  assert.equal(p.shiftMinutes({ ...S, saturday: "half" }, "2026-09-19"), 270)
  assert.equal(p.shiftMinutes({ ...S, saturday: "full" }, "2026-09-19"), 540)
  assert.equal(p.shiftMinutes({}, "2026-09-18"), 540)
})

test("worked time runs to now while on duty, and a rejected punch does not count", () => {
  const day = "2026-09-18"
  const list = [
    punch(day, "in", 9, 30),
    punch(day, "out", 13, 0),
    punch(day, "in", 13, 30),
    punch(day, "out", 14, 0, { review: "rejected" }),
  ]
  const now = new Date(ist(day, 15, 30)).getTime()
  const w = p.workedMs(day, list, now)
  assert.equal(w.ms, (3.5 * 60 + 2 * 60) * 60000)
  assert.equal(w.openSince, new Date(ist(day, 13, 30)).getTime())
  assert.equal(p.hms(w.ms), "05:30:00")
})

test("progress words", () => {
  assert.equal(p.progressWords(340, 540), "3h 20m to go")
  assert.equal(p.progressWords(540, 540), "Shift complete")
  assert.equal(p.progressWords(565, 540), "Overtime 25m")
  // Once the shift is over and nobody is on duty, the gap is a shortfall.
  assert.equal(p.progressWords(13, 540, true), "8h 47m short")
  assert.equal(p.progressWords(565, 540, true), "Overtime 25m")
  const s = { shift: { start: "09:30", end: "18:30" } }
  assert.equal(p.shiftEnded(s, "2026-09-19", p.istMs("2026-09-19", "20:28")), true)
  assert.equal(p.shiftEnded(s, "2026-09-19", p.istMs("2026-09-19", "17:00")), false)
  assert.equal(p.shiftEnded({}, "2026-09-19", p.istMs("2026-09-19", "23:00")), false)
})

test("timeline: segments, now, grace, a late start and a punch beyond the shift", () => {
  const day = "2026-09-18"
  const list = [punch(day, "in", 10, 0), punch(day, "out", 13, 0), punch(day, "in", 14, 0)]
  const now = new Date(ist(day, 19, 30)).getTime()
  const t = p.dayTimeline(day, list, S, now)
  // Axis stretches from 9:30 to 19:30 (the open stretch runs past 18:30).
  assert.equal(t.startMs, new Date(ist(day, 9, 30)).getTime())
  assert.equal(t.endMs, now)
  assert.equal(t.segments.length, 2)
  assert.equal(t.segments[1].open, true)
  assert.equal(t.now, 1)
  assert.ok(t.late && t.late.width > 0, "10:00 is after the 9:45 grace end")
  assert.ok(Math.abs(t.shiftRight - 0.9) < 1e-9, "18:30 is 9/10 of a 9:30 to 19:30 axis")
})

test("week strip: Monday to Sunday, today live, the future marked", () => {
  const now = new Date(ist("2026-09-18", 12, 0)).getTime() // a Friday
  const cols = p.weekColumns([{ day: "2026-09-14", worked_min: 480 }, { day: "2026-09-18", worked_min: 60 }], 150, now)
  assert.deepEqual(cols.map((c) => c.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  assert.equal(cols[0].day, "2026-09-14")
  assert.equal(cols[0].minutes, 480)
  assert.equal(cols[4].today, true)
  assert.equal(cols[4].minutes, 150)
  assert.equal(cols[5].future, true)
})

test("punch window: 20 min before the shift to 9 PM, IST", () => {
  const at = (hh, mm) => new Date(ist("2026-09-18", hh, mm)).getTime()
  assert.equal(p.punchWindowClosed(S, at(9, 10)), null)
  assert.equal(p.punchWindowClosed(S, at(21, 0)), null)
  assert.equal(p.punchWindowClosed(S, at(9, 9)), "Attendance can be marked only between 9:10 AM and 9:00 PM.")
  assert.ok(p.punchWindowClosed(S, at(21, 1)))
  assert.equal(p.punchWindowClosed({ ...S, openBeforeMin: 60, closeAt: "22:00" }, at(21, 30)), null)
})
