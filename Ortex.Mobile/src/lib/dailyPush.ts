import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import {
  dailyInsight,
  INSIGHT_AT,
  MOTIVATION_AT,
  motivationFor,
  nextAt,
  type InsightAccess,
} from "@/domain/dailyDigest"
import { DAY } from "@/domain/dashboard"
import type { Enquiry, Quotation } from "@/domain/schema"

/**
 * The daily motivation and insight, SCHEDULED rather than posted.
 *
 * Unlike a lead alert (lib/push.ts), which the running app posts the moment it
 * hears a new row, these are handed to Android's alarm clock ahead of time, so
 * they fire at 9 with the app closed or the phone asleep. expo-notifications
 * re-arms them after a reboot from its own BOOT_COMPLETED receiver.
 *
 * Motivation is planned 14 mornings ahead, a different line each day, so a rep
 * who does not open the app for a week still gets them. The insight is planned
 * ONE morning ahead only, because its figures are frozen at scheduling time: a
 * phone left alone for a week must not repeat the same stale numbers seven times.
 * Each app session replans both, and the engine replans the insight as new rows
 * arrive, so it carries the latest figures the phone has seen.
 *
 * Everything this module schedules has an id starting `ortex.daily.`, and only
 * those are ever cancelled, never a lead alert.
 */

export const CHANNEL_DAILY = "daily_v1"
const PREFIX = "ortex.daily."
const MOTIVATION_DAYS = 14

let channelReady = false

async function ensureChannel() {
  if (channelReady || Platform.OS !== "android") return
  channelReady = true
  // DEFAULT importance and the system sound: a morning note, not an order
  // alert. The loud ring and the long buzz stay reserved for leads.
  await Notifications.setNotificationChannelAsync(CHANNEL_DAILY, {
    name: "Daily updates",
    description: "A morning line of motivation and yesterday's sales in brief",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#2F50E4",
  }).catch(() => {})
}

async function cancelWhere(match: (id: string) => boolean) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [])
  await Promise.all(
    scheduled
      .filter((n) => match(n.identifier))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  )
}

async function scheduleAt(id: string, when: number, content: { title: string; body: string }) {
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: content.title,
      body: content.body,
      color: "#2F50E4",
      // A tap simply opens the app; the engine's lead handler ignores these.
      data: { daily: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_DAILY } : {}),
    },
  })
}

/** Plan the next 14 mornings of motivation, replacing any earlier plan. */
export async function planMotivation(firstName: string, now = Date.now()): Promise<void> {
  await ensureChannel()
  await cancelWhere((id) => id.startsWith(`${PREFIX}motivation.`))
  const first = nextAt(now, MOTIVATION_AT)
  for (let i = 0; i < MOTIVATION_DAYS; i++) {
    const when = first + i * DAY
    const line = motivationFor(when, firstName)
    await scheduleAt(`${PREFIX}motivation.${i}`, when, line).catch(() => {})
  }
}

let lastInsight = ""

/**
 * Plan tomorrow morning's insight from the rows the phone holds now. A no-op
 * when the wording has not changed, because the engine calls this on every
 * realtime refetch and each call is a round trip to the OS.
 */
export async function planInsight(args: {
  enquiries: Enquiry[]
  quotations: Quotation[]
  access: InsightAccess
  now?: number
}): Promise<void> {
  const now = args.now ?? Date.now()
  const fireAt = nextAt(now, INSIGHT_AT)
  const insight = dailyInsight({ ...args, now, fireAt })
  const key = insight ? `${fireAt}|${insight.title}|${insight.body}` : `none|${fireAt}`
  if (key === lastInsight) return
  lastInsight = key
  await ensureChannel()
  await cancelWhere((id) => id.startsWith(`${PREFIX}insight`))
  if (!insight) return
  await scheduleAt(`${PREFIX}insight`, fireAt, { title: insight.title, body: insight.body }).catch(() => {})
}

/**
 * Post today's motivation and the insight as it would read tomorrow, NOW, from
 * the settings screen, so a rep can see what 9:00 and 9:30 will bring without
 * waiting for the morning.
 */
export async function previewDaily(args: {
  firstName: string
  enquiries: Enquiry[]
  quotations: Quotation[]
  access: InsightAccess
}): Promise<void> {
  await ensureChannel()
  const now = Date.now()
  const trigger = Platform.OS === "android" ? { channelId: CHANNEL_DAILY } : null
  const line = motivationFor(now, args.firstName)
  await Notifications.scheduleNotificationAsync({
    identifier: `${PREFIX}preview.motivation`,
    content: { title: line.title, body: line.body, color: "#2F50E4", data: { daily: true } },
    trigger,
  })
  const insight = dailyInsight({ ...args, now, fireAt: nextAt(now, INSIGHT_AT) })
  if (!insight) return
  await Notifications.scheduleNotificationAsync({
    identifier: `${PREFIX}preview.insight`,
    content: { title: insight.title, body: insight.body, color: "#2F50E4", data: { daily: true } },
    trigger,
  })
}

/** Cancel one kind, or every daily notification (signing out, muting). */
export async function cancelDaily(kind?: "motivation" | "insight"): Promise<void> {
  if (!kind || kind === "insight") lastInsight = ""
  await cancelWhere((id) => id.startsWith(kind ? `${PREFIX}${kind}` : PREFIX))
}
