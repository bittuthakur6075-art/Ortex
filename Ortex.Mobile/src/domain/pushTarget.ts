import type { NotificationPrefs } from "@/domain/notifications"

/**
 * Where a tapped notification goes, and which server pushes this phone wants.
 * Pure, so it is tested off-device (test/pushTarget.test.mjs).
 *
 * A notification's data comes in three shapes: the app's own lead alerts carry
 * `target: { screen, id }`; server pushes (Admin push-notify) and the app's
 * realtime copies of them carry flat strings `targetScreen` / `targetId`,
 * because FCM data is a flat string map; scheduled notes (daily, attendance
 * reminders) carry `daily` and a `screen`.
 */

export type PushRoute = { screen: string; params?: Record<string, string> }

/** The sample from Notification settings: no record behind it. Equals TEST_NOTIFICATION_ID in lib/push.ts. */
const TEST_ID = "ortex.test"

// Routes a notification may open, with how its id becomes params. A screen not
// listed here is ignored: a payload can name anything, the navigator cannot.
const BY_ID = new Set(["EnquiryDetail", "VoiceCallDetail", "QuotationDetail", "ChatThread", "LeaveRequest", "Payslip"])
const NO_PARAMS = new Set(["AttendanceApprovals", "Leave", "Pay", "Notifications", "Attendance"])

export function pushRoute(data: Record<string, unknown> | null | undefined): PushRoute | null {
  if (!data) return null
  if (data.daily) return typeof data.screen === "string" && NO_PARAMS.has(data.screen) ? { screen: data.screen } : null
  if (data.id === TEST_ID) return { screen: "Notifications" }

  const t = data.target as { screen?: unknown; id?: unknown } | undefined
  const screen = String(t?.screen ?? data.targetScreen ?? "")
  const id = String(t?.id ?? data.targetId ?? "")

  // Claims were removed (Admin 0077); an older claim alert opens My pay.
  if (screen === "PayClaims") return { screen: "Pay" }
  if (screen === "AttendanceDay") return /^\d{4}-\d{2}-\d{2}$/.test(id) ? { screen, params: { day: id } } : null
  if (NO_PARAMS.has(screen)) return { screen }
  if (BY_ID.has(screen) && id) return { screen, params: { id } }
  return null
}

/**
 * The server push categories this phone has switched off, saved with its token
 * (register_push_device, Admin migration 0074) so push-notify can skip it even
 * when the app is closed. "all" is the master switch.
 */
export function mutedPushCategories(prefs: NotificationPrefs): string[] {
  if (!prefs.enabled) return ["all"]
  return (["enquiries", "voice", "chat", "requests", "pay"] as const).filter((k) => prefs[k] === false)
}
