// Phone-only attendance helpers: status colours from the theme, and the IST
// date/time formatting the screens and the correction form need. Not in
// domain/attendance.ts, which is mirrored to the console line for line.

import { STATUS_TONE, type DayStatus } from "@/domain/attendance"
import type { Colors, StatusTone } from "@/theme/theme"

/** A status's tinted well and readable ink, from the theme's status tones. */
export function statusColors(t: Colors, s: DayStatus) {
  const tone = STATUS_TONE[s]
  const key: StatusTone = tone === "primary" ? "blue" : tone
  return t.tones[key]
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
