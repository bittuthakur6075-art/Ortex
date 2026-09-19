import { describe, expect, it } from "vitest"
import { deadlinesForFy, deadlinesForWageMonth, dueWords, shortDate, upcomingDeadlines } from "./payrollDeadlines"

const byKind = (list) => Object.fromEntries(list.map((d) => [d.kind, d.due]))

describe("deadlinesForWageMonth", () => {
  it("dates a normal month's dues in the next month", () => {
    expect(byKind(deadlinesForWageMonth("2026-09"))).toEqual({
      salary: "2026-10-07",
      tds: "2026-10-07",
      pf: "2026-10-15",
      esi: "2026-10-15",
    })
  })

  it("gives March's TDS until 30 April", () => {
    expect(byKind(deadlinesForWageMonth("2027-03-01")).tds).toBe("2027-04-30")
  })

  it("adds Delhi LWF for June and December only", () => {
    expect(byKind(deadlinesForWageMonth("2026-06")).lwf).toBe("2026-07-15")
    expect(byKind(deadlinesForWageMonth("2026-12")).lwf).toBe("2027-01-15")
    expect(byKind(deadlinesForWageMonth("2026-07")).lwf).toBeUndefined()
  })

  it("crosses the year for December", () => {
    expect(byKind(deadlinesForWageMonth("2026-12")).pf).toBe("2027-01-15")
  })

  it("follows the schedule's pay day, clamped to the month", () => {
    expect(byKind(deadlinesForWageMonth("2026-09", { payDay: 1 })).salary).toBe("2026-10-01")
    expect(byKind(deadlinesForWageMonth("2027-01", { payDay: 31 })).salary).toBe("2027-02-28")
  })
})

describe("deadlinesForFy", () => {
  it("dates the quarterly statements and Form 130", () => {
    const list = deadlinesForFy(2026)
    expect(list.map((d) => d.due)).toEqual(["2026-07-31", "2026-10-31", "2027-01-31", "2027-05-31", "2027-06-15"])
    expect(list.at(-1).title).toBe("Issue Form 130")
    expect(list[0].period).toBe("2026-27")
  })
})

describe("upcomingDeadlines", () => {
  it("lists what falls due in the window, soonest first", () => {
    const list = upcomingDeadlines("2026-09-19", { days: 45 })
    expect(list.map((d) => `${d.kind}:${d.due}`)).toEqual([
      "salary:2026-10-07",
      "tds:2026-10-07",
      "esi:2026-10-15",
      "pf:2026-10-15",
      "form138:2026-10-31",
    ])
    expect(list[0].daysLeft).toBe(18)
    expect(list[0].period).toBe("2026-09")
  })

  it("includes a deadline due today", () => {
    const list = upcomingDeadlines("2026-10-15", { days: 0 })
    expect(list.map((d) => d.kind).sort()).toEqual(["esi", "pf"])
    expect(list[0].daysLeft).toBe(0)
  })

  it("finds Form 130 and March's TDS around the year end", () => {
    const kinds = upcomingDeadlines("2027-04-20", { days: 60 }).map((d) => `${d.kind}:${d.due}`)
    expect(kinds).toContain("tds:2027-04-30")
    expect(kinds).toContain("form138:2027-05-31")
    expect(kinds).toContain("form130:2027-06-15")
  })

  it("finds January's LWF from December", () => {
    expect(upcomingDeadlines("2027-01-02", { days: 20 }).some((d) => d.kind === "lwf" && d.due === "2027-01-15")).toBe(true)
  })
})

describe("words", () => {
  it("says how far off a deadline is", () => {
    expect(dueWords(0)).toBe("Due today")
    expect(dueWords(1)).toBe("Due tomorrow")
    expect(dueWords(9)).toBe("In 9 days")
    expect(shortDate("2026-10-07")).toBe("7 Oct")
  })
})
