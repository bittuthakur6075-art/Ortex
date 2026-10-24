import { describe, expect, it } from "vitest"
import { byNumberDesc, compareValues, dateValue, newestFirst, sortRows } from "./listSort"

describe("listSort", () => {
  it("sorts text case-insensitively with numbers in numeric order", () => {
    const rows = [{ n: "item 10" }, { n: "Item 2" }, { n: "apple" }, { n: "Banana" }]
    expect(sortRows(rows, { key: "n", desc: false }).map((r) => r.n)).toEqual(["apple", "Banana", "Item 2", "item 10"])
  })

  it("keeps blanks last in both directions", () => {
    const rows = [{ n: "" }, { n: "b" }, { n: null }, { n: "a" }]
    expect(sortRows(rows, { key: "n", desc: false }).map((r) => r.n)).toEqual(["a", "b", "", null])
    expect(sortRows(rows, { key: "n", desc: true }).map((r) => r.n).slice(0, 2)).toEqual(["b", "a"])
  })

  it("sorts numbers as numbers and breaks ties", () => {
    const rows = [{ v: 5, no: "Q-0009" }, { v: 10, no: "Q-0001" }, { v: 5, no: "Q-0012" }]
    const out = sortRows(rows, { key: "v", desc: true }, undefined, byNumberDesc((r) => r.no))
    expect(out.map((r) => r.no)).toEqual(["Q-0001", "Q-0012", "Q-0009"])
  })

  it("reads dates and falls back to createdAt", () => {
    expect(dateValue("2026-10-01")).toBe(new Date("2026-10-01").getTime())
    expect(dateValue("not a date")).toBeNull()
    const rows = [
      { id: "a", date: "2026-09-01" },
      { id: "b", date: null, createdAt: "2026-10-05" },
      { id: "c", date: "2026-10-01" },
    ]
    expect([...rows].sort(newestFirst((r) => r.date)).map((r) => r.id)).toEqual(["b", "c", "a"])
  })

  it("compareValues treats NaN as blank", () => {
    expect(compareValues(NaN, 1)).toBe(1)
    expect(compareValues(1, NaN, true)).toBe(-1)
  })
})
