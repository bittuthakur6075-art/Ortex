import type { LeaveStatus } from "@/domain/attendance"
import type { StatusTone } from "@/theme/theme"
import type { IconName } from "@/ui/Icon"

// The leave screens' visual vocabulary, mapped onto the attendance codes so a
// day reads the same on every page: paid leave is the calendar's "L" (violet),
// unpaid leave its "LOP" (red). Types are told apart by their CODE letters
// (CL, EL, SL, CO) in the well and on the date leaf, never by a colour of their
// own, because green, red and amber already mean Approved, Rejected and Pending
// on the same rows. Presentation only, so it lives here rather than in
// domain/attendance.ts.

const TYPE_ICON: Record<string, IconName> = {
  EL: "star",
  CL: "calendar",
  SL: "theme",
  CO: "refresh",
  LOP: "money",
}

/** A leave type's tone: the attendance calendar's L, or LOP for unpaid leave. */
export const leaveTone = (code: string): StatusTone => (code === "LOP" ? "rose" : "violet")

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
