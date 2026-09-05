import { describe, it, expect } from "vitest"
import { selectStale } from "./prune.mjs"

// Real filenames, as backup.mjs writes them: ortex-YYYY-MM-DD-HH-MM-SS.json.
// The fixed-width timestamp is what makes a plain string sort a date sort.
const dump = (d) => `ortex-${d}.json`
const days = (n) => Array.from({ length: n }, (_, i) => dump(`2026-09-${String(i + 1).padStart(2, "0")}-20-00-00`))

describe("selectStale", () => {
  it("keeps everything when there are fewer files than the limit", () => {
    expect(selectStale(days(5), 30)).toEqual([])
  })

  it("keeps everything when the count exactly equals the limit", () => {
    expect(selectStale(days(30), 30)).toEqual([])
  })

  it("deletes only the overflow, oldest first", () => {
    const stale = selectStale(days(33), 30)
    expect(stale).toEqual([
      dump("2026-09-01-20-00-00"),
      dump("2026-09-02-20-00-00"),
      dump("2026-09-03-20-00-00"),
    ])
  })

  it("always leaves exactly `keep` files behind", () => {
    for (const total of [1, 29, 30, 31, 100]) {
      const keep = 30
      const remaining = total - selectStale(days(total), keep).length
      expect(remaining).toBe(Math.min(total, keep))
    }
  })

  it("never deletes the newest file, even at keep = 1", () => {
    const files = days(10)
    const stale = selectStale(files, 1)
    expect(stale).not.toContain(files[files.length - 1])
    expect(stale).toHaveLength(9)
  })

  it("ignores files that are not our dumps", () => {
    const files = ["backup.log", "notes.txt", "ortex-old.zip", ...days(32)]
    const stale = selectStale(files, 30)
    expect(stale).toHaveLength(2)
    expect(stale.every((f) => f.startsWith("ortex-") && f.endsWith(".json"))).toBe(true)
  })

  it("prunes nothing when keep is missing or nonsense", () => {
    // A bad --keep must not be read as "keep zero" and wipe the directory.
    for (const bad of [undefined, NaN, 0, -5, 1.5, "30", null]) {
      expect(selectStale(days(50), bad)).toEqual([])
    }
  })

  it("sorts by date, not by directory order", () => {
    const shuffled = [dump("2026-09-03-20-00-00"), dump("2026-09-01-20-00-00"), dump("2026-09-02-20-00-00")]
    expect(selectStale(shuffled, 1)).toEqual([dump("2026-09-01-20-00-00"), dump("2026-09-02-20-00-00")])
  })
})
