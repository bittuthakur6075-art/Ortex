import * as Notifications from "expo-notifications"
import React from "react"
import { AppState, Platform } from "react-native"

import { supabase } from "@/data/supabase"
import { isAdmin } from "@/domain/modules"
import { loadDirectory } from "@/hooks/useRecordHistory"
import { holidays, loadSettings } from "@/lib/attendance"
import { cancelAttendanceReminders, planAttendanceReminders } from "@/lib/attendanceReminders"
import { myRequests } from "@/lib/leave"
import { useNotificationStore } from "@/lib/notificationStore"
import { CHANNEL_REMINDERS } from "@/lib/push"
import { useAuth } from "@/store/AuthContext"

import { istDay } from "./reminderPlan"

/**
 * Attendance's background work, mounted ONCE in the authenticated branch of
 * RootNavigator next to <NotificationEngine />, so a signed-out phone runs none
 * of it and signing out tears it down.
 *
 *   <AttendanceReminderPlanner /> keeps the clock in / clock out reminders planned
 *   <AttendanceApprovalAlerts />  leave and correction requests and decisions,
 *                                 while the app is open
 */

// ---- reminders --------------------------------------------------------------------------------

const REPLAN_MS = 6 * 60 * 60 * 1000

export function AttendanceReminderPlanner() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const { prefs } = useNotificationStore()
  const on = prefs.enabled && prefs.attendance !== false

  React.useEffect(() => {
    if (!uid) return
    if (!on) {
      void cancelAttendanceReminders()
      return
    }
    let alive = true
    const plan = async () => {
      try {
        const today = istDay(Date.now())
        const until = new Date(Date.parse(`${today}T00:00:00Z`) + 8 * 86400000).toISOString().slice(0, 10)
        const [cfg, hol, leave] = await Promise.all([
          loadSettings(),
          holidays({ from: today, to: until }).catch(() => []),
          myRequests().catch(() => []),
        ])
        if (!alive) return
        const doc = cfg as typeof cfg & { weeklyOff?: number[] }
        await planAttendanceReminders({
          shiftStart: cfg.shift?.start,
          shiftEnd: cfg.shift?.end,
          graceMin: cfg.graceMin,
          weeklyOff: Array.isArray(doc.weeklyOff) ? doc.weeklyOff : [0],
          saturday: cfg.saturday,
          holidays: hol.filter((h) => h.active && h.kind !== "optional").map((h) => h.day),
          leave: leave
            .filter((l) => l.status === "approved")
            .map((l) => ({ from: l.from_day, to: l.to_day, fromHalf: l.from_half, toHalf: l.to_half })),
        })
      } catch {
        /* reminders are a nicety: a failed plan tries again on the next foreground */
      }
    }
    void plan()
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") void plan()
    })
    const timer = setInterval(() => void plan(), REPLAN_MS)
    return () => {
      alive = false
      app.remove()
      clearInterval(timer)
    }
  }, [uid, on])

  // Signing out unmounts this: the next person must not be reminded of this shift.
  React.useEffect(
    () => () => {
      void cancelAttendanceReminders()
    },
    [],
  )

  return null
}

// ---- approval alerts ---------------------------------------------------------------------------

type ApprovalRow = {
  id: string
  user_id: string
  status: string
  decided_by?: string | null
  type_code?: string
  from_day?: string
  to_day?: string
  day?: string
  days?: number
  reason?: string
  decision_note?: string | null
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayWords = (iso?: string) => {
  if (!iso) return ""
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

/**
 * Leave requests and corrections while the app is open, from realtime. Admins
 * hear about new requests from others; everyone hears when their own request
 * is decided by someone else. Each notification uses the SAME identifier the
 * server push uses (push-notify, migration 0038), so the two replace each
 * other. Realtime only delivers changes made after it subscribed, so nothing
 * from before this session ever rings.
 */
export function AttendanceApprovalAlerts() {
  const { session, profile } = useAuth()
  const uid = session?.user?.id
  const admin = isAdmin(profile)
  const { prefs } = useNotificationStore()
  const enabled = prefs.enabled

  React.useEffect(() => {
    if (!uid || !enabled) return
    const channels = (["leave_requests", "regularisations"] as const).map((table) =>
      supabase
        .channel(`ortex-approvals-${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, (e) => {
          void announce(table, e.eventType, e.new as ApprovalRow, uid, admin)
        })
        .subscribe(),
    )
    return () => {
      channels.forEach((c) => void supabase.removeChannel(c))
    }
  }, [uid, admin, enabled])

  return null
}

async function announce(
  table: "leave_requests" | "regularisations",
  event: string,
  row: ApprovalRow,
  me: string,
  admin: boolean,
) {
  if (!row?.id) return
  const leave = table === "leave_requests"
  const tag = `${leave ? "leave" : "corr"}-${row.status}-${row.id}`
  let title = ""
  let body = ""
  let targetScreen = ""
  let targetId = row.id

  if (event === "INSERT" && row.status === "pending") {
    if (!admin || row.user_id === me) return
    const dir = await loadDirectory().catch(() => ({}) as Record<string, { name?: string }>)
    const who = (dir as Record<string, { name?: string }>)[row.user_id]?.name || "A colleague"
    title = leave ? `Leave request · ${who}` : `Correction request · ${who}`
    body = leave
      ? `${row.type_code} · ${row.days} ${Number(row.days) === 1 ? "day" : "days"} · ${
          row.from_day === row.to_day ? dayWords(row.from_day) : `${dayWords(row.from_day)} to ${dayWords(row.to_day)}`
        }`
      : `${dayWords(row.day)}. ${row.reason || ""}`.trim()
    targetScreen = "AttendanceApprovals"
  } else if (
    event === "UPDATE" &&
    ["approved", "rejected", "cancelled"].includes(row.status) &&
    row.user_id === me &&
    row.decided_by &&
    row.decided_by !== me
  ) {
    const verdict = row.status === "approved" ? "approved" : row.status === "rejected" ? "not approved" : "cancelled"
    title = leave ? `Your leave was ${verdict}` : `Your correction was ${verdict}`
    body = leave
      ? `${row.type_code} · ${
          row.from_day === row.to_day ? dayWords(row.from_day) : `${dayWords(row.from_day)} to ${dayWords(row.to_day)}`
        }${row.decision_note ? `. ${row.decision_note}` : ""}`
      : `${dayWords(row.day)}${row.decision_note ? `. ${row.decision_note}` : ""}`
    targetScreen = leave ? "LeaveRequest" : "AttendanceDay"
    if (!leave && row.day) targetId = row.day
  } else {
    return
  }

  await Notifications.scheduleNotificationAsync({
    identifier: tag,
    content: {
      title,
      body,
      color: "#2F50E4",
      data: { id: tag, targetScreen, targetId, phone: "", title },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_REMINDERS } : null,
  }).catch(() => {})
}
