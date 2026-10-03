import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { supabase } from "@/data/supabase"

/**
 * REMOTE push: this phone's Firebase Cloud Messaging token, registered against
 * the signed-in person so the `push-notify` edge function (Ortex.Admin, fired by
 * database triggers: leads 0031, leave and corrections 0038, chat 0047, payslips
 * and claims 0074) can reach it with the app closed.
 *
 * It sits BESIDE the local alerts in lib/push.ts, not instead of them. While the
 * app is alive it still posts its own copies; the server sends the same
 * notification id as the Android tag, so the two replace each other rather than
 * stacking.
 *
 * The token is saved with the server push categories this phone has switched
 * off (`muted`, domain/pushTarget.ts), because the notification prefs live only
 * on the handset and the server cannot read them otherwise.
 *
 * Everything here fails SOFT. A build without `android/app/google-services.json`
 * has no Firebase, `getDevicePushTokenAsync` throws, and the app simply keeps
 * the local alerts it always had.
 */

let registered: string | null = null
let muted: string[] = []
let listener: Notifications.EventSubscription | null = null

async function save(token: string): Promise<boolean> {
  const { error } = await supabase.rpc("register_push_device", {
    p_token: token,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_app_version: APP_VERSION,
    p_muted: muted,
  })
  if (error) return false
  registered = token
  return true
}

const removeToken = (token: string) =>
  supabase
    .from("push_devices")
    .delete()
    .eq("token", token)
    .then(
      () => {},
      () => {},
    )

/**
 * Register this phone for the signed-in person, with the categories it has
 * muted. Call once a session exists, and again whenever the prefs change.
 */
export async function registerPushDevice(mutedCategories: string[] = muted): Promise<boolean> {
  muted = mutedCategories
  try {
    const { data } = await Notifications.getDevicePushTokenAsync()
    const token = typeof data === "string" ? data : ""
    if (!token) return false
    const ok = await save(token)
    // FCM rotates tokens now and then (onTokenRefresh); follow it without a
    // restart, and drop the old row so it is not sent to until FCM rejects it.
    listener?.remove()
    listener = Notifications.addPushTokenListener(({ data: next }) => {
      if (typeof next !== "string" || !next || next === registered) return
      const old = registered
      void save(next).then((saved) => {
        if (saved && old) void removeToken(old)
      })
    })
    return ok
  } catch {
    return false
  }
}

/**
 * Remove this phone's row. Must run BEFORE the session ends: the delete is
 * scoped to the caller by RLS, and a signed-out client has no caller. When this
 * run never registered (it failed, or has not got there yet), the token is
 * asked for again so the row still goes.
 */
export async function unregisterPushDevice(): Promise<void> {
  listener?.remove()
  listener = null
  let token = registered
  registered = null
  muted = []
  if (!token) {
    token = await Promise.race([
      Notifications.getDevicePushTokenAsync().then(
        (t) => (typeof t.data === "string" ? t.data : null),
        () => null,
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
  }
  if (token) await removeToken(token)
}
