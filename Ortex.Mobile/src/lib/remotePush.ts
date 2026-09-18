import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { supabase } from "@/data/supabase"

/**
 * REMOTE push: this phone's Firebase Cloud Messaging token, registered against
 * the signed-in person so the `push-notify` edge function (Ortex.Admin, fired by
 * migration 0031's trigger on every new enquiry) can reach it with the app
 * closed.
 *
 * It sits BESIDE the local alerts in lib/push.ts, not instead of them. While the
 * app is alive the engine still posts its own copy, which carries the Call and
 * WhatsApp buttons; the server sends the same notification id as the Android
 * tag, so the two replace each other rather than stacking.
 *
 * Everything here fails SOFT. A build without `android/app/google-services.json`
 * has no Firebase, `getDevicePushTokenAsync` throws, and the app simply keeps
 * the local alerts it always had; a project without migration 0031 refuses the
 * RPC, and the same is true.
 */

let registered: string | null = null
let listener: Notifications.EventSubscription | null = null

async function save(token: string) {
  const { error } = await supabase.rpc("register_push_device", {
    p_token: token,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_app_version: APP_VERSION,
  })
  if (!error) registered = token
}

/** Register this phone for the signed-in person. Call once a session exists. */
export async function registerPushDevice(): Promise<boolean> {
  try {
    const { data } = await Notifications.getDevicePushTokenAsync()
    const token = typeof data === "string" ? data : ""
    if (!token) return false
    await save(token)
    // FCM rotates tokens now and then; follow it without a restart.
    listener?.remove()
    listener = Notifications.addPushTokenListener(({ data: next }) => {
      if (typeof next === "string" && next && next !== registered) void save(next).catch(() => {})
    })
    return registered === token
  } catch {
    return false
  }
}

/**
 * Remove this phone's row. Must run BEFORE the session ends: the delete is
 * scoped to the caller by RLS, and a signed-out client has no caller.
 */
export async function unregisterPushDevice(): Promise<void> {
  listener?.remove()
  listener = null
  const token = registered
  registered = null
  if (!token) return
  await supabase
    .from("push_devices")
    .delete()
    .eq("token", token)
    .then(
      () => {},
      () => {},
    )
}
