import { describe, expect, it } from "vitest"
import { attendanceExpectations } from "./attendanceToday"

const people = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", active: false }, { id: "e" }]
const expected = (day, ctx) => people.filter(attendanceExpectations(day, ctx).expects).map((p) => p.id)

describe("who is expected in today", () => {
  it("leaves out autoPresent, full-day leave and inactive people, but not half-day leave", () => {
    // 2026-10-01 is a Thursday.
    const leave = [
      { user_id: "b", from_day: "2026-10-01", to_day: "2026-10-01", from_half: "full", to_half: "full" },
      { user_id: "e", from_day: "2026-10-01", to_day: "2026-10-01", from_half: "second", to_half: "second" },
    ]
    expect(expected("2026-10-01", { settings: { autoPresent: ["c"] }, leave })).toEqual(["a", "e"])
  })

  it("expects nobody on a weekly off or a holiday, but an optional holiday is a working day", () => {
    expect(expected("2026-10-04", {})).toEqual([]) // Sunday, the default weekly off
    expect(expected("2026-10-04", { settings: { weeklyOff: [] } })).toEqual(["a", "b", "c", "e"])
    expect(expected("2026-10-02", { holidays: [{ kind: "festival" }] })).toEqual([])
    expect(expected("2026-10-02", { holidays: [{ kind: "optional" }] })).toEqual(["a", "b", "c", "e"])
    expect(expected("2026-10-02", { holidays: [{ kind: "festival", active: false }] })).toEqual(["a", "b", "c", "e"])
  })
})
