import { STATUS_TONE } from "../../lib/attendance"

// Date words for the attendance pages, in IST whatever the browser's zone.

/** "12 Sep 2026" (or "Sat, 12 Sep 2026"), from a YYYY-MM-DD day. */
export function dayLabel(day, withWeekday = false) {
  const d = new Date(`${day}T00:00:00+05:30`)
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  })
}

// ---- status tints and month helpers (Register, My attendance) ----

export const TONE_CLASS = {
  emerald: "bg-success/12 text-success-text",
  cyan: "bg-primary/10 text-primary",
  amber: "bg-warning/12 text-warning-text",
  rose: "bg-destructive/10 text-destructive-text",
  violet: "bg-info/10 text-info-text",
  slate: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/10 text-primary",
}

export const toneFor = (status) => TONE_CLASS[STATUS_TONE[status]] || TONE_CLASS.slate

/** The codes in the order a payroll person reads them. */
export const STATUS_ORDER = ["P", "OD", "HD", "MP", "A", "LOP", "L", "WO", "H"]

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

/** Weekday and date for a register column header; `dow` 0 = Sunday. */
export function dayHead(day) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  return { wd: WD[dow], dow, date: Number(day.slice(8, 10)) }
}

/** Every YYYY-MM-DD of a "YYYY-MM" month. */
export function daysOf(month) {
  const [y, m] = month.split("-").map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)
}
