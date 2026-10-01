// The month as Zoho People's attendance list draws it, the pure half: one entry
// per day from the 1st to today (newest first), each either a WORKED day (a
// timeline bar from first in to last out across the shift) or a BAND (weekend,
// holiday, leave, absent: a tinted strip with the word), plus the bar geometry.
// Phone-only; domain/attendance.ts is mirrored to the console and stays as is.

import { effectiveStatus, type AttendanceDay, type DayStatus } from "@/domain/attendance"
import { istWeekday } from "@/features/attendance/progress"

export type MonthEntry =
  | { day: string; kind: "worked"; status: DayStatus; row: AttendanceDay }
  | { day: string; kind: "band"; status: DayStatus; label: string; row: AttendanceDay | null }
  | { day: string; kind: "empty"; row: null }

const BAND_WORDS: Partial<Record<DayStatus, string>> = {
  WO: "Weekly off",
  H: "Holiday",
  L: "Leave",
  A: "Absent",
  LOP: "Loss of pay",
}

const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/**
 * Every day of the month up to today, newest first. A day with a row is what the
 * server says; a day without one is a Sunday (weekend) or a listed holiday when
 * it is one, and otherwise "empty" (nothing recorded, never guessed absent).
 */
export function monthEntries(
  bounds: { from: string; to: string },
  rows: AttendanceDay[],
  holidays: { day: string; name: string }[],
  today: string,
  /** IST weekdays off (0 = Sunday), the Super Admin's setting. */
  weeklyOff: number[] = [0],
): MonthEntry[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const hol = new Map(holidays.map((h) => [h.day, h.name]))
  const last = bounds.to < today ? bounds.to : today
  const out: MonthEntry[] = []
  for (let d = last; d >= bounds.from; d = addDay(d, -1)) {
    const row = byDay.get(d) ?? null
    const holidayName = hol.get(d)
    if (row) {
      const s = effectiveStatus(row)
      const words = BAND_WORDS[s]
      // Present by default (0056): no punches to draw, so it reads as what it is.
      if (!row.first_in && row.flags?.includes("auto_present")) {
        out.push({ day: d, kind: "band", status: s, row, label: "Present by default" })
      } else if (words && !row.first_in) {
        out.push({ day: d, kind: "band", status: s, row, label: s === "H" && holidayName ? `Holiday: ${holidayName}` : words })
      } else {
        out.push({ day: d, kind: "worked", status: s, row })
      }
    } else if (holidayName) {
      out.push({ day: d, kind: "band", status: "H", label: `Holiday: ${holidayName}`, row: null })
    } else if (weeklyOff.includes(istWeekday(d))) {
      out.push({ day: d, kind: "band", status: "WO", label: "Weekly off", row: null })
    } else {
      out.push({ day: d, kind: "empty", row: null })
    }
    if (d === bounds.from) break
  }
  return out
}
