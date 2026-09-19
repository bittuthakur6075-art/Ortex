// Phone-only attendance helpers: status colours from the theme, and the IST
// date/time formatting the screens and the correction form need. Not in
// domain/attendance.ts, which is mirrored to the console line for line.

import type { DayStatus } from "@/domain/attendance"
import type { Colors, StatusTone } from "@/theme/theme"

/**
 * Zoho People's status colours, onto the theme: Present (and field duty) green,
 * Absent and loss of pay red, Weekend amber, Holiday blue, Leave in the brand
 * violet, and a half day or missed punch in the warning hue. `tone` names the
 * theme's status tone (its tinted well and readable ink).
 */
const ZOHO_TONE: Record<DayStatus, StatusTone> = {
  P: "emerald",
  OD: "emerald",
  A: "rose",
  LOP: "rose",
  WO: "amber",
  H: "blue",
  L: "violet",
  HD: "amber",
  MP: "amber",
}

/** A status's tinted well and readable ink, in Zoho People's colours. */
export function statusColors(t: Colors, s: DayStatus) {
  return t.tones[ZOHO_TONE[s]]
}

const DAY_LONG = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** "Fri 2 Oct" for an IST day key, formatted in UTC so the phone's zone cannot shift it. */
export const dayLabel = (day: string) => DAY_LONG.format(new Date(`${day}T00:00:00Z`)).replace(",", "")

/** An IST wall time on a day, as an ISO timestamp the server stores. */
export const istISO = (day: string, hhmm: string) => `${day}T${hhmm}:00+05:30`

/** HH:MM (24 h) → 9:30 AM. */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

/** Move an HH:MM by some minutes, clamped to the same day (00:00 to 23:45). */
export function stepClock(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = Math.min(23 * 60 + 45, Math.max(0, h * 60 + m + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/** An ISO timestamp (or epoch ms) → its IST HH:MM, for pre-filling the correction form. */
export function istHHMM(at: string | number): string {
  const d = new Date(new Date(at).getTime() + 330 * 60000)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}

/**
 * A status's SATURATED hue, for a dot, a bar or a rule (never for text), in
 * Zoho People's scheme (see ZOHO_TONE).
 */
export function statusHue(t: Colors, s: DayStatus): string {
  switch (ZOHO_TONE[s]) {
    case "emerald":
      return t.success
    case "rose":
      return t.danger
    case "amber":
      return t.warning
    case "blue":
      return t.info
    case "violet":
      return t.primary
    default:
      return t.borderStrong
  }
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" })

/** "Fri" for an IST day key. */
export const weekdayShort = (day: string) => WEEKDAY_SHORT.format(new Date(`${day}T00:00:00Z`))

/** The date of the month for an IST day key: "2026-09-04" → 4. */
export const dateOf = (day: string) => Number(day.slice(8, 10))

/** 492 minutes → "8h 12m"; 0 → "0h". Short enough for a tile or a column. */
export function hoursShort(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}
