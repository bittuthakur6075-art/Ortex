import type { LeaveStatus } from "@/domain/attendance"
import type { StatusTone } from "@/theme/theme"
import type { IconName } from "@/ui/Icon"

// The leave screens' visual vocabulary (Zoho People's Leave Tracker, in this
// app's flat One UI dress): every leave type has ONE colour and ONE glyph, used
// on its balance tile, its date badge, its request row and its ledger, so the
// eye learns "green is casual leave" once and reads it everywhere after.
// Presentation only, so it lives here rather than in domain/attendance.ts.

const TYPE_TONE: Record<string, StatusTone> = {
  EL: "blue",
  CL: "emerald",
  SL: "rose",
  CO: "amber",
  LOP: "slate",
}
const FALLBACK_TONES: StatusTone[] = ["cyan", "violet", "blue", "emerald", "amber", "rose"]

const TYPE_ICON: Record<string, IconName> = {
  EL: "star",
  CL: "calendar",
  SL: "theme",
  CO: "refresh",
  LOP: "money",
}

/** A leave type's tone, stable for a code the seed does not know. */
export function leaveTone(code: string): StatusTone {
  if (TYPE_TONE[code]) return TYPE_TONE[code]
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return FALLBACK_TONES[h % FALLBACK_TONES.length]
}

export const leaveIcon = (code: string): IconName => TYPE_ICON[code] || "calendar"

/** "4" · "4.5" · "0.5": a day count as a bare figure. */
export const daysFigure = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))

/** "day" for 1 and 0.5, "days" otherwise, to sit after `daysFigure`. */
export const dayUnit = (n: number) => (n === 1 || n === 0.5 ? "day" : "days")

/** The chip's word. Short, as a list column reads it; the detail page says more. */
export const SHORT_STATUS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export const STATUS_TONE: Record<LeaveStatus, StatusTone> = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
  cancelled: "slate",
}

/** The date leaf's size, shared by the row and its skeleton. */
export const DATE_BADGE = { width: 48, height: 56 }

/** A balance tile's size, shared by the rail's snap interval and the skeleton. */
export const TILE = { width: 156, height: 170 }
