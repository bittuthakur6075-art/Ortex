import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import { planReminders, istDay, type ReminderRules } from "@/features/attendance/reminderPlan"

/**
 * "You have not clocked in" and "Clock out?", SCHEDULED on the phone like the
 * daily updates (lib/dailyPush.ts), so they fire with the app closed.
 *
 * Seven working days are planned ahead from the Super Admin's shift, weekly
 * off, holidays and the person's approved leave (features/attendance/
 * reminderPlan.ts) and today's punches. Clocking in cancels today's "clock in"
 * reminder; clocking out cancels today's "clock out" one, and that is kept per
 * IST day on the handset so a cold start does not bring them back. Only ids
 * starting `ortex.att.` are ever touched here.
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

// Kinds dealt with on one IST day: { day, kinds }.
const DISMISSED_KEY = "@ortex/attendance-reminders-dismissed"
type Dismissed = { day: string; kinds: ("in" | "out")[] }

async function readDismissed(day: string): Promise<("in" | "out")[]> {
  try {
    const d = JSON.parse((await AsyncStorage.getItem(DISMISSED_KEY)) || "null") as Dismissed | null
    return d?.day === day && Array.isArray(d.kinds) ? d.kinds : []
  } catch {
    return []
  }
}

/** Replace the plan with the next seven working days' reminders. */
export async function planAttendanceReminders(rules: ReminderRules, now = Date.now()): Promise<number> {
  await ensureChannel()
  const dismissedToday = await readDismissed(istDay(now))
  const plan = planReminders({ ...rules, dismissedToday }, now)
  // `now` may be the server's clock; the phone fires by its own.
  const skew = now - Date.now()
  const wanted = new Set(plan.map((r) => idFor(r.kind, r.day)))
  // Cancel what is no longer wanted (a new holiday, approved leave, a rule change).
  for (const id of await scheduledIds()) {
    if (!wanted.has(id)) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  }
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: idFor(r.kind, r.day),
      content: {
        title: r.kind === "in" ? "You have not clocked in" : "Clock out?",
        body:
          r.kind === "in"
            ? "Your shift has started. Open Ortex and scan the office code to clock in."
            : "Your shift is over. Remember to clock out before you leave.",
        color: "#2F50E4",
        data: { daily: true, screen: "Attendance" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at - skew,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ATTENDANCE } : {}),
      },
    }).catch(() => {})
  }
  return plan.length
}

/**
 * Clocked in (or out): that day's reminder is no longer needed. `at` is the
 * punch's own time, so a punch answered after midnight still clears its day.
 * A clock-out clears the clock-in nudge too.
 */
export async function cancelTodayReminder(kind: "in" | "out", at: string | number = Date.now()): Promise<void> {
  const day = istDay(new Date(at).getTime())
  const kinds: ("in" | "out")[] = kind === "out" ? ["in", "out"] : ["in"]
  const merged = [...new Set([...(await readDismissed(day)), ...kinds])]
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify({ day, kinds: merged } satisfies Dismissed)).catch(() => {})
  for (const k of kinds) await Notifications.cancelScheduledNotificationAsync(idFor(k, day)).catch(() => {})
}

/** Signing out, or the reminders switched off. */
export async function cancelAttendanceReminders(): Promise<void> {
  for (const id of await scheduledIds()) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  // The handset's "dealt with today" belongs to whoever was signed in.
  await AsyncStorage.removeItem(DISMISSED_KEY).catch(() => {})
}
