import React from "react"

import { dayKey, type LeaveRequest } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { holidays as loadHolidays, loadSettings, type Holiday } from "@/lib/attendance"

// Leave helpers shared by the leave screens and the attendance pages (phase 3).
// Phone-only, so not in domain/attendance.ts, which is mirrored to the console.

export const DAY_MS = 86400000

/** YYYY-MM-DD plus n days, in the IST calendar the server counts in. */
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

export const todayIST = () => dayKey(Date.now())

/**
 * A request's dates in words: "Fri 2 Oct", "Fri 2 Oct, afternoon",
 * "Fri 2 Oct (from lunch) to Mon 5 Oct (until lunch)".
 */
export function leaveDatesWords(r: Pick<LeaveRequest, "from_day" | "to_day" | "from_half" | "to_half">): string {
  if (r.from_day === r.to_day) {
    if (r.from_half === "second") return `${dayLabel(r.from_day)}, afternoon`
    if (r.to_half === "first") return `${dayLabel(r.from_day)}, morning`
    return dayLabel(r.from_day)
  }
  const a = `${dayLabel(r.from_day)}${r.from_half === "second" ? " (from lunch)" : ""}`
  const b = `${dayLabel(r.to_day)}${r.to_half === "first" ? " (until lunch)" : ""}`
  return `${a} to ${b}`
}

export type LeaveRules = { weeklyOff: number[]; sandwich: boolean; holidays: Holiday[] }

/**
 * The rules the Apply screen counts with: the weekly off and sandwich setting
 * (attendance_settings) and the holidays from a month back to a year ahead.
 * Fails soft to Sunday off, no sandwich, no holidays: the server's count is
 * the one that is saved anyway.
 */
export function useLeaveRules() {
  const [rules, setRules] = React.useState<LeaveRules>({ weeklyOff: [0], sandwich: false, holidays: [] })
  const reload = React.useCallback(async () => {
    const today = todayIST()
    const [s, h] = await Promise.all([
      loadSettings().catch(() => ({})),
      loadHolidays({ from: addDays(today, -40), to: addDays(today, 400) }).catch(() => [] as Holiday[]),
    ])
    const doc = s as { weeklyOff?: number[]; sandwich?: boolean }
    setRules({
      weeklyOff: Array.isArray(doc.weeklyOff) ? doc.weeklyOff : [0],
      sandwich: Boolean(doc.sandwich),
      holidays: h,
    })
  }, [])
  React.useEffect(() => {
    void reload()
  }, [reload])
  return { rules, reload }
}
