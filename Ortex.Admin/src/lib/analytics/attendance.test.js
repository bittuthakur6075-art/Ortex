import { describe, expect, it } from "vitest"
import {
  byPerson,
  changeWords,
  computeAttendanceInsights,
  latesByWeekday,
  leaveByType,
  needsAttention,
  summarise,
  upcomingLeave,
  windowFor,
} from "./attendance"

const row = (day, status, over = {}) => ({ user_id: "u1", day, status, worked_min: 480, late: false, ...over })

describe("attendance rate", () => {
  it("is (P + OD + half of HD) over working days, and leave never lowers it", () => {
    const s = summarise([
      row("2026-09-14", "P"),
      row("2026-09-15", "OD"),
      row("2026-09-16", "HD", { worked_min: 240 }),
      row("2026-09-17", "A", { worked_min: 0 }),
      row("2026-09-18", "MP", { worked_min: 0 }),
      row("2026-09-19", "L", { worked_min: 0, leave_fraction: 1 }),
      row("2026-09-20", "WO", { worked_min: 0 }),
    ])
    // Working: P, OD, HD, A, MP = 5; earned 1 + 1 + 0.5 = 2.5 → 50%.
    expect(s.working).toBe(5)
    expect(s.rate).toBe(50)
    expect(s.leave).toBe(1)
    expect(s.missed).toBe(1)
    expect(s.absent).toBe(1)
    // Worked days with hours: P, OD, HD → (480 + 480 + 240) / 3 = 400 min.
    expect(s.avgHours).toBe(6.7)
  })

  it("uses the Super Admin's override over the computed status", () => {
    const s = summarise([row("2026-09-17", "A", { override_status: "P" })])
    expect(s.rate).toBe(100)
    expect(s.absent).toBe(0)
  })

  it("has no rate when there were no working days", () => {
    expect(summarise([row("2026-09-20", "WO")]).rate).toBe(null)
  })
})

describe("the previous window", () => {
  it("is the same length, ending the day before this one starts", () => {
    expect(windowFor("7d", "2026-09-19")).toEqual({
      days: 7,
      from: "2026-09-13",
      to: "2026-09-19",
      prevFrom: "2026-09-06",
      prevTo: "2026-09-12",
    })
  })

  it("states a change in words, with good and bad by direction", () => {
    expect(changeWords(92.5, 88, { unit: "points", noun: "the previous 30 days", digits: 1 })).toEqual({
      text: "4.5 points higher than the previous 30 days",
      tone: "good",
    })
    expect(changeWords(6, 2, { unit: "late marks", better: "down" })).toEqual({
      text: "4 late marks more than the previous period",
      tone: "bad",
    })
    expect(changeWords(3, 3)).toEqual({ text: "Same as the previous period", tone: "flat" })
    expect(changeWords(null, 3).tone).toBe("flat")
  })

  it("splits the rows it is given into this window and the one before", () => {
    const days = [
      row("2026-09-10", "A", { worked_min: 0 }), // previous window
      row("2026-09-15", "P"),
      row("2026-09-16", "P", { late: true }),
    ]
    const r = computeAttendanceInsights({ days, range: "7d", today: "2026-09-19" })
    expect(r.now.rate).toBe(100)
    expect(r.before.rate).toBe(0)
    expect(r.now.lates).toBe(1)
    expect(r.trend).toHaveLength(7)
    expect(r.trend.find((t) => t.day === "2026-09-16").present).toBe(1)
  })
})

describe("by person", () => {
  it("aggregates each person's days, named from the directory", () => {
    const rows = [
      row("2026-09-14", "P", { late: true }),
      row("2026-09-15", "P", { late: true }),
      row("2026-09-16", "P", { late: true }),
      row("2026-09-17", "A", { worked_min: 0 }),
      row("2026-09-14", "P", { user_id: "u2" }),
      row("2026-09-15", "A", { user_id: "u2", worked_min: 0 }),
      row("2026-09-16", "A", { user_id: "u2", worked_min: 0 }),
    ]
    const people = byPerson(rows, { u1: { name: "Asha" }, u2: { name: "Ravi" } })
    expect(people.map((p) => p.name)).toEqual(["Asha", "Ravi"])
    expect(people[0]).toMatchObject({ present: 3, lates: 3, absent: 1, rate: 75 })
    expect(people[1]).toMatchObject({ present: 1, lates: 0, absent: 2 })
    const a = needsAttention(people, 30)
    expect(a.map((x) => x.text)).toEqual([
      "Asha was late 3 times in the last 30 days.",
      "Ravi was absent 2 days in the last 30 days.",
    ])
  })

  it("names someone missing from the directory plainly", () => {
    expect(byPerson([row("2026-09-14", "P", { user_id: "gone" })])[0].name).toBe("Former colleague")
  })
})

describe("the smaller figures", () => {
  it("counts lates Monday to Saturday", () => {
    const l = latesByWeekday([row("2026-09-14", "P", { late: true }), row("2026-09-19", "P", { late: true }), row("2026-09-20", "P", { late: true })])
    expect(l.map((x) => x.count)).toEqual([1, 0, 0, 0, 0, 1]) // Sunday 20 not shown
  })

  it("sums leave by type inside the window, half days included", () => {
    const t = leaveByType([
      row("2026-09-14", "L", { leave_type: "CL", leave_fraction: 1 }),
      row("2026-09-15", "HD", { leave_type: "CL", leave_fraction: 0.5 }),
      row("2026-09-16", "LOP", { leave_type: "LOP", leave_fraction: 1 }),
    ])
    expect(t).toEqual([
      { code: "CL", days: 1.5 },
      { code: "LOP", days: 1 },
    ])
  })

  it("lists approved leave that is running or starts within 14 days", () => {
    const reqs = [
      { id: "a", status: "approved", from_day: "2026-09-18", to_day: "2026-09-20" },
      { id: "b", status: "approved", from_day: "2026-10-01", to_day: "2026-10-02" },
      { id: "c", status: "approved", from_day: "2026-10-10", to_day: "2026-10-10" },
      { id: "d", status: "pending", from_day: "2026-09-25", to_day: "2026-09-25" },
    ]
    expect(upcomingLeave(reqs, "2026-09-19").map((r) => r.id)).toEqual(["a", "b"])
  })
})
