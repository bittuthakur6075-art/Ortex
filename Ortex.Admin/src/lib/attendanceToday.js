import { weeklyOffOf } from "./attendance"

/**
 * Who is expected in on `day`: the one rule Attendance → Today, the
 * Dashboard's Team today and the gate screen's "of N in" share (the phone's
 * teamBoard reads it the same way). Nobody on a weekly off or a holiday that
 * is not optional; otherwise every active person except the Super Admin's
 * autoPresent list and anyone on approved leave for the day. Half a day of
 * leave still leaves a half to come in for.
 *
 * `holidays` and `leave` are that day's rows (listHolidays, approved
 * listLeaveRequests); `settings` is the attendance_settings doc.
 */
export function attendanceExpectations(day, { settings = {}, holidays = [], leave = [] } = {}) {
  const holiday = holidays.some((h) => h.active !== false && h.kind !== "optional")
  const dayOff = holiday || weeklyOffOf(settings).includes(new Date(`${day}T00:00:00Z`).getUTCDay())
  const notExpected = new Set([
    ...(settings.autoPresent || []),
    ...leave
      .filter((r) => !(r.from_day === day && r.from_half === "second") && !(r.to_day === day && r.to_half === "first"))
      .map((r) => r.user_id),
  ])
  const expects = (p) => !dayOff && p.active !== false && !notExpected.has(p.id)
  return { holiday, dayOff, notExpected, expects }
}
