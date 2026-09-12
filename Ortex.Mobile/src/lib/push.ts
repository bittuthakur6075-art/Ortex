import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import type { AppNotification, NotificationActionId } from "@/domain/notifications"

/**
 * The notification shade.
 *
 * These are LOCAL notifications, not remote push, and that is a design decision
 * rather than a shortcut. Everything this app would notify about is derived
 * (see domain/notifications.ts) from rows it already holds and already watches
 * over Supabase realtime, so the phone can post the same message itself with no
 * FCM/APNs credentials, no device-token table, no server fan-out and nothing new
 * to keep in step with the console. The cost is honest and worth stating: the
 * app must be running (foreground, or alive in the background) for a signal to
 * reach the shade. Waking a killed app needs FCM, which is a separate piece of
 * work — see docs in Ortex.Mobile/README.md.
 *
 * Every notification carries its ACTIONS, because on a field-sales phone the
 * answer to "new lead from Rakesh, 5000 lanyards" is to ring Rakesh, and that
 * should not require opening the app to find the number. The buttons are wired
 * in features/notifications/useNotificationEngine.ts, which owns the response
 * listener; this file owns the OS plumbing only.
 */

/** Categories — the sets of action buttons a notification can be posted with. */
export const CATEGORY_WITH_PHONE = "ortex.lead.phone"
export const CATEGORY_PLAIN = "ortex.lead.plain"

/** Android channels. Separate, so a rep can silence reminders and keep leads. */
export const CHANNEL_LEADS = "leads"
export const CHANNEL_REMINDERS = "reminders"

/** What the OS hands back in a response, and what the engine acts on. */
export type PushPayload = {
  id: string
  target: AppNotification["target"]
  phone: string
  title: string
}

let configured = false

// A tapped or actioned notification should open the app, not just dismiss.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Channels and categories, once per process. Android needs the channel to exist
 * BEFORE the first notification is posted — one created afterwards does not
 * retro-apply its importance, so the first lead of the install would arrive
 * silent and every later one would chime.
 */
export async function configurePush(): Promise<void> {
  if (configured) return
  configured = true

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_LEADS, {
      name: "Leads",
      description: "New enquiries and voice calls from the website",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2F50E4",
    }).catch(() => {})
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: "Reminders",
      description: "Enquiries going cold and quotations about to expire",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#2F50E4",
    }).catch(() => {})
  }

  // `opensAppToForeground: false` on Call and WhatsApp is the point of them:
  // the rep taps Call in the shade and the dialler opens, without the app
  // painting a screen they did not ask for on the way.
  await Notifications.setNotificationCategoryAsync(CATEGORY_WITH_PHONE, [
    { identifier: "call", buttonTitle: "Call", options: { opensAppToForeground: false } },
    { identifier: "whatsapp", buttonTitle: "WhatsApp", options: { opensAppToForeground: false } },
    { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } },
  ]).catch(() => {})
  await Notifications.setNotificationCategoryAsync(CATEGORY_PLAIN, [
    { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } },
  ]).catch(() => {})
}

/**
 * Ask for permission, once the rep has actually seen what the app does.
 * Android 13+ needs POST_NOTIFICATIONS at runtime; below that, and on a device
 * that already granted it, this resolves immediately.
 */
export async function ensurePushPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    // `canAskAgain: false` means the rep denied it in the OS — asking again is
    // a no-op that returns denied, so report it rather than loop.
    if (!current.canAskAgain) return false
    const next = await Notifications.requestPermissionsAsync()
    return next.granted
  } catch {
    return false
  }
}

export async function pushPermissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted
  } catch {
    return false
  }
}

const REMINDER_KINDS = new Set(["enquiry-stale", "quotation-expiring", "quotation-expired"])

/**
 * Post one notification. `trigger: null` means "now" — these are already-true
 * facts about leads that have landed, never a schedule.
 */
export async function presentNotification(item: AppNotification): Promise<void> {
  const payload: PushPayload = {
    id: item.id,
    target: item.target,
    phone: item.phone,
    title: item.title,
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: item.push.title,
      body: item.push.body,
      // The long-form body Android expands to, so a lead with four items is
      // readable without opening anything.
      subtitle: item.module,
      data: payload as unknown as Record<string, unknown>,
      categoryIdentifier: item.phone ? CATEGORY_WITH_PHONE : CATEGORY_PLAIN,
      sound: true,
      // Urgent rows (a complaint, an expired quote) get the loud treatment.
      priority: item.urgent
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.HIGH,
      color: "#2F50E4",
      ...(Platform.OS === "android"
        ? { channelId: REMINDER_KINDS.has(item.kind) ? CHANNEL_REMINDERS : CHANNEL_LEADS }
        : null),
    },
    // The same deterministic id the feed uses, so the OS replaces an earlier
    // copy of the same signal instead of stacking duplicates.
    identifier: item.id,
    trigger: null,
  })
}

/** Clear the shade — used when the rep marks everything read in the app. */
export async function dismissAll(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync().catch(() => {})
  await Notifications.setBadgeCountAsync(0).catch(() => {})
}

export async function dismissNotification(id: string): Promise<void> {
  await Notifications.dismissNotificationAsync(id).catch(() => {})
}

export async function setBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count).catch(() => {})
}

/** The action the rep tapped, or "open" for the notification body itself. */
export function actionFromResponse(response: Notifications.NotificationResponse): NotificationActionId {
  const id = response.actionIdentifier
  if (id === "call" || id === "whatsapp") return id
  return "open"
}

export function payloadFromResponse(
  response: Notifications.NotificationResponse,
): PushPayload | null {
  const data = response.notification.request.content.data as unknown as PushPayload | undefined
  return data?.target ? data : null
}

export { Notifications }
