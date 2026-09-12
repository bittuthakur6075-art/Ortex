import React from "react"
import { AppState } from "react-native"

import type { AppNotification } from "@/domain/notifications"
import { useNotifications } from "@/features/notifications/useNotifications"
import { callNumber, whatsapp } from "@/lib/contact"
import {
  hydrateNotifications,
  markPushed,
  markRead,
  pruneFlags,
  wasPushed,
} from "@/lib/notificationStore"
import {
  actionFromResponse,
  configurePush,
  ensurePushPermission,
  Notifications,
  payloadFromResponse,
  presentNotification,
  pushPermissionGranted,
  setBadge,
} from "@/lib/push"
import { navigateWhenReady } from "@/navigation/navigationRef"

/**
 * Turns the derived feed into notifications in the shade, and the taps on those
 * notifications back into screens.
 *
 * Mounted ONCE, from RootNavigator, inside the authenticated branch: the feed it
 * reads is per-profile, and a signed-out phone must announce nothing.
 *
 * The first-pass rule is the important one. A rep installing the app has a
 * fortnight of live leads waiting, and posting thirty notifications at once is
 * not a feature — it is a phone that has to be silenced. So the FIRST pass after
 * hydration marks the whole existing feed as already announced, silently, and
 * only what appears after that rings. That applies to every cold start, not just
 * the first ever: whatever arrived while the app was dead is on the screen the
 * rep is looking at, and announcing it to someone already reading it is noise. The mark is the same `pushed` flag that
 * stops a pull-to-refresh, a realtime refetch or a cold start from re-announcing
 * yesterday's lead: ids are deterministic (record id + signal), so "already
 * pushed" is a durable fact rather than a guess about timing.
 */
export function useNotificationEngine() {
  const { all, unreadCount } = useNotifications()

  // A ref, not state: the responder callbacks are registered once and must see
  // the current feed without re-registering on every refetch.
  const feedRef = React.useRef<AppNotification[]>(all)
  feedRef.current = all

  // State, not a ref: when setup finishes the posting effect below must RUN
  // again, and a ref changing never re-renders anything.
  const [ready, setReady] = React.useState(false)
  const baselined = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await hydrateNotifications()
      await configurePush()
      // A no-op when it is already granted, and when the rep has refused it in
      // the OS for good; neither case is worth a second prompt.
      await ensurePushPermission()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- posting ------------------------------------------------------------

  React.useEffect(() => {
    if (!ready || !all.length) return
    let cancelled = false

    void (async () => {
      // Ids no longer in the feed have been answered, extended or archived out
      // of existence; their flags would otherwise accumulate forever.
      pruneFlags(all.map((n) => n.id))

      const fresh = all.filter((n) => !wasPushed(n.id))
      if (!fresh.length) return

      if (!baselined.current) {
        baselined.current = true
        markPushed(fresh.map((n) => n.id))
        return
      }

      if (!(await pushPermissionGranted())) {
        // Permission was refused or revoked. Mark them anyway: the in-app list
        // still shows every one of them, and holding a backlog to fire the
        // moment permission is granted would flood the shade.
        markPushed(fresh.map((n) => n.id))
        return
      }

      // Newest last, so the most recent lead ends up on top of the stack.
      for (const item of [...fresh].reverse()) {
        if (cancelled) return
        await presentNotification(item).catch(() => {})
      }
      markPushed(fresh.map((n) => n.id))
    })()

    return () => {
      cancelled = true
    }
  }, [all, ready])

  // The app-icon badge follows the unread count, not the shade — clearing a
  // notification without reading the lead should not clear the badge.
  React.useEffect(() => {
    void setBadge(unreadCount)
  }, [unreadCount])

  // ---- responding ---------------------------------------------------------

  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = payloadFromResponse(response)
      if (!payload) return
      const action = actionFromResponse(response)

      // Tapping or acting on it IS reading it, on any of the three buttons.
      markRead(payload.id)

      if (action === "call" && payload.phone) {
        void callNumber(payload.phone)
        return
      }
      if (action === "whatsapp" && payload.phone) {
        const item = feedRef.current.find((n) => n.id === payload.id)
        void whatsapp(payload.phone, item ? greeting(item) : undefined)
        return
      }

      navigateWhenReady(payload.target.screen, { id: payload.target.id } as never)
    })
    return () => sub.remove()
  }, [])

  // Coming back to the foreground: clear a badge the OS may be holding from a
  // notification the rep swiped away, and re-assert the real count.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void setBadge(unreadCount)
    })
    return () => sub.remove()
  }, [unreadCount])
}

/**
 * The message WhatsApp opens with. A rep returning a lead from the shade should
 * not have to type the opener — and the customer should be told which enquiry
 * this is about, since they may have asked three suppliers.
 */
function greeting(item: AppNotification): string {
  const who = item.customerName && item.customerName !== "Unknown contact" ? ` ${item.customerName}` : ""
  const about =
    item.module === "Quotations"
      ? `about ${item.facts[0] || "your quotation"}`
      : "about your enquiry with Ortex Industries"
  return `Hello${who}, this is Ortex Industries getting back to you ${about}.`
}

/**
 * The engine as a component, so it mounts only inside the AUTHENTICATED branch
 * of RootNavigator. As a hook at the top of that component it would run while
 * the app is still on the login screen, where it would subscribe to collections
 * there is no session to read — and announce the previous user's leads to the
 * next one.
 */
export function NotificationEngine() {
  useNotificationEngine()
  return null
}
