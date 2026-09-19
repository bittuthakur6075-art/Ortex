// Phone-only: day rows drawn from punches alone, for a project where migration
// 0034 (attendance_days) is not applied yet. Moved here from the history screen
// so the Attendance page's week strip can use the same rule. Not in
// domain/attendance.ts, which is mirrored to the console line for line.

import { summarizeDays, type AttendanceDay, type DayStatus, type Punch } from "@/domain/attendance"

/**
 * A day with a counted clock-in is present (field, if every punch was), and an
 * in left open on a past day is a missed punch. No absences and no late marks,
 * because those need the rules the server applies.
 */
export function daysFromPunches(punches: Punch[], today: string): AttendanceDay[] {
  return summarizeDays(punches)
    .filter((d) => d.firstIn)
    .map((d) => ({
      user_id: "",
      day: d.day,
      status: (d.open && d.day < today ? "MP" : d.field ? "OD" : "P") as DayStatus,
      first_in: d.firstIn,
      last_out: d.lastOut,
      worked_min: d.workedMin,
      late: false,
      late_min: 0,
      flags: [],
    }))
}

/**
 * This week's columns (progress.ts weekColumns) with what each day counts as,
 * and a coming holiday marked as planned. Nothing is guessed: a day without a
 * row (or punches) has no status.
 */
export function weekCells(
  cols: { day: string; label: string; minutes: number; today: boolean; future: boolean }[],
  rows: { day: string; status: DayStatus | null }[],
  holiday: string | null | undefined,
): (typeof cols[number] & { status: DayStatus | null; planned: DayStatus | null })[] {
  const byDay = new Map(rows.map((d) => [d.day, d.status]))
  return cols.map((c) => ({
    ...c,
    status: byDay.get(c.day) ?? null,
    planned: c.future && c.day === holiday ? ("H" as DayStatus) : null,
  }))
}
