import { clockIST, durationWords, type DaySummary } from "@/domain/attendance"

/**
 * Team attendance, the pure half (TeamAttendanceScreen): one status per
 * person, then the sections in the order an admin acts on them. Leave, the
 * Super Admin's "present by default" list (0056), a holiday and the weekly off
 * are all accounted for first, so nobody reads as missing who is not.
 */

export type TeamPerson = {
  userId: string
  name: string
  avatarUrl: string
  phone: string
  summary: DaySummary
  onDuty: boolean
  leave: { code: string; half: boolean } | null
  autoPresent: boolean
}

export type BoardStatus = "notIn" | "expected" | "working" | "auto" | "done" | "leave" | "off"
export type BoardRow = TeamPerson & { status: BoardStatus; lateMin: number; review: boolean; line: string }
export type BoardKey = "notIn" | "working" | "done" | "leave" | "off"
export type BoardSection = { key: BoardKey; title: string; data: BoardRow[] }
export type BoardRules = {
  day: string
  now: number
  shiftStart?: string
  graceMin?: number
  off: string | null
}

const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm.padStart(5, "0")}:00+05:30`)

export function boardRow(p: TeamPerson, r: BoardRules): BoardRow {
  const s = p.summary
  const start = r.shiftStart ? at(r.day, r.shiftStart) : NaN
  const due = start + (r.graceMin || 0) * 60000
  const lateMin =
    s.firstIn && !r.off && Date.parse(s.firstIn) > due
      ? Math.round((Date.parse(s.firstIn) - start) / 60000)
      : 0
  const base = { ...p, lateMin, review: s.flagged > 0 }
  if (s.firstIn && p.onDuty) {
    const where = s.field ? "Field · " : ""
    return {
      ...base,
      status: "working",
      line: `${where}In ${clockIST(s.firstIn)} · ${durationWords(s.workedMin)}`,
    }
  }
  if (s.firstIn) {
    const out = s.lastOut ? ` to ${clockIST(s.lastOut)}` : ""
    return { ...base, status: "done", line: `${clockIST(s.firstIn)}${out} · ${durationWords(s.workedMin)}` }
  }
  if (p.leave)
    return { ...base, status: "leave", line: `${p.leave.half ? "Half day " : ""}${p.leave.code} leave` }
  if (r.off) return { ...base, status: "off", line: r.off }
  if (p.autoPresent) return { ...base, status: "auto", line: "Present by default" }
  if (!(r.now >= due)) {
    const when = r.shiftStart ? `Shift starts ${clockIST(start)}` : "No check-in yet"
    return { ...base, status: "expected", line: when }
  }
  return { ...base, status: "notIn", line: "Not checked in" }
}

const SECTION: Record<BoardStatus, BoardKey> = {
  notIn: "notIn",
  expected: "notIn",
  working: "working",
  auto: "working",
  done: "done",
  leave: "leave",
  off: "off",
}
const TITLE: Record<BoardKey, string> = {
  notIn: "Not in yet",
  working: "Working now",
  done: "Checked out",
  leave: "On leave",
  off: "Off today",
}
const ORDER: BoardKey[] = ["notIn", "working", "done", "leave", "off"]

/** Rows into sections; inside each, the order that answers the section's question. */
export function boardSections(rows: BoardRow[]): BoardSection[] {
  const byName = (a: BoardRow, b: BoardRow) => a.name.localeCompare(b.name)
  const sorters: Record<BoardKey, (a: BoardRow, b: BoardRow) => number> = {
    // Overdue before still-expected, then by name.
    notIn: (a, b) => Number(a.status === "expected") - Number(b.status === "expected") || byName(a, b),
    // First in first; the present-by-default people after the ones who punched.
    working: (a, b) => (a.summary.firstIn || "~").localeCompare(b.summary.firstIn || "~") || byName(a, b),
    // Most recent check-out first.
    done: (a, b) => (b.summary.lastOut || "").localeCompare(a.summary.lastOut || "") || byName(a, b),
    leave: byName,
    off: byName,
  }
  return ORDER.map((key) => ({
    key,
    title: TITLE[key],
    data: rows.filter((r) => SECTION[r.status] === key).sort(sorters[key]),
  })).filter((s) => s.data.length)
}

export function boardCounts(rows: BoardRow[]) {
  const n = (f: (r: BoardRow) => boolean) => rows.filter(f).length
  return {
    total: rows.length,
    present: n((r) => r.status === "working" || r.status === "auto" || r.status === "done"),
    notIn: n((r) => r.status === "notIn"),
    expected: n((r) => r.status === "expected"),
    leave: n((r) => r.status === "leave"),
    late: n((r) => r.lateMin > 0),
    review: n((r) => r.review),
  }
}
