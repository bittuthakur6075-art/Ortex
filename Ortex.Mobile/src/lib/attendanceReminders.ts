import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import { planReminders, istDay, type ReminderRules } from "@/features/attendance/reminderPlan"

/**
 * "You have not clocked in" and "Clock out?", SCHEDULED on the phone like the
 * daily updates (lib/dailyPush.ts), so they fire with the app closed.
 *
 * Seven working days are planned ahead from the Super Admin's shift, weekly
 * off, holidays and the person's approved leave (features/attendance/
 * reminderPlan.ts). Clocking in cancels today's "clock in" reminder; clocking
 * out cancels today's "clock out" one. Only ids starting `ortex.att.` are ever
 * touched here.
 */

export const CHANNEL_ATTENDANCE = "attendance_v1"
const PREFIX = "ortex.att."
const idFor = (kind: "in" | "out", day: string) => `${PREFIX}${kind}.${day}`

let channelReady = false
async function ensureChannel() {
  if (channelReady || Platform.OS !== "android") return
  channelReady = true
  await Notifications.setNotificationChannelAsync(CHANNEL_ATTENDANCE, {
    name: "Attendance reminders",
    description: "A nudge to clock in after the grace period, and to clock out at the end of the shift",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#2F50E4",
  }).catch(() => {})
}

async function scheduledIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => [])
  return all.map((n) => n.identifier).filter((id) => id.startsWith(PREFIX))
}

/** Replace the plan with the next seven working days' reminders. */
export async function planAttendanceReminders(rules: ReminderRules, now = Date.now()): Promise<number> {
  await ensureChannel()
  const plan = planReminders(rules, now)
  const wanted = new Set(plan.map((r) => idFor(r.kind, r.day)))
  // Cancel what is no longer wanted (a new holiday, approved leave, a rule change).
  for (const id of await scheduledIds()) {
    if (!wanted.has(id)) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  }
  const today = istDay(now)
  for (const r of plan) {
    // Today's reminder that the person already dealt with stays cancelled.
    if (r.day === today && dismissedToday.has(r.kind)) continue
    await Notifications.scheduleNotificationAsync({
      identifier: idFor(r.kind, r.day),
      content: {
        title: r.kind === "in" ? "You have not clocked in" : "Clock out?",
        body:
          r.kind === "in"
            ? "Your shift has started. Open Ortex and slide to clock in."
            : "Your shift is over. Remember to clock out before you leave.",
        color: "#2F50E4",
        data: { daily: true, screen: "Attendance" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ATTENDANCE } : {}),
      },
    }).catch(() => {})
  }
  return plan.length
}

// Kinds dealt with today, so a replan later the same day does not bring them back.
const dismissedToday = new Set<"in" | "out">()
let dismissedDay = ""

/** Clocked in (or out) today: its reminder is no longer needed. */
export async function cancelTodayReminder(kind: "in" | "out"): Promise<void> {
  const today = istDay(Date.now())
  if (dismissedDay !== today) {
    dismissedToday.clear()
    dismissedDay = today
  }
  dismissedToday.add(kind)
  await Notifications.cancelScheduledNotificationAsync(idFor(kind, today)).catch(() => {})
}

/** Signing out, or the reminders switched off. */
export async function cancelAttendanceReminders(): Promise<void> {
  for (const id of await scheduledIds()) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
}
