import React from "react"

import {
  buildNotifications,
  type AppNotification,
  type NotificationPrefs,
} from "@/domain/notifications"
import { canAccess } from "@/domain/modules"
import type { Enquiry, Quotation } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { useNotificationStore } from "@/lib/notificationStore"
import { useAuth } from "@/store/AuthContext"

/**
 * The live feed, plus the unread split every caller needs.
 *
 * One hook, two consumers: the bell in the app bar (which wants a count) and the
 * Notifications screen (which wants the rows). Both read the SAME shared
 * collection store, so mounting the bell on all four tabs costs no extra fetch.
 *
 * Access is enforced here rather than in the builder: a Sales Executive granted
 * only `quotations` must not be told about enquiries they cannot open. The
 * module check is the console's own `canAccess`, so the phone can never announce
 * a record RLS would refuse.
 */
export type NotificationFeed = {
  /** The whole feed, newest first. */
  active: AppNotification[]
  unread: AppNotification[]
  /** Same list, under the name the push engine reads it by. */
  all: AppNotification[]
  unreadCount: number
  loading: boolean
  refreshing: boolean
  error: string | null
  reload: () => Promise<void>
  isRead: (id: string) => boolean
  /** The rep's switches, narrowed to the modules this profile can open. */
  prefs: NotificationPrefs
}

/** Prefs narrowed to what this profile is actually allowed to see. */
function allowedPrefs(
  prefs: NotificationPrefs,
  profile: Parameters<typeof canAccess>[0],
): NotificationPrefs {
  const enquiries = canAccess(profile, "enquiries")
  return {
    enabled: prefs.enabled,
    enquiries: prefs.enquiries && enquiries,
    stale: prefs.stale && enquiries,
    voice: prefs.voice && canAccess(profile, "voice-leads"),
    quotations: prefs.quotations && canAccess(profile, "quotations"),
    motivation: prefs.motivation,
    // Everyone has their own attendance.
    attendance: prefs.attendance,
    // An insight about modules the profile cannot open would be a number it
    // cannot check, so it follows the same access as the Home tab.
    insights: prefs.insights && (enquiries || canAccess(profile, "voice-leads") || canAccess(profile, "quotations")),
  }
}

export function useNotifications(): NotificationFeed {
  const { profile } = useAuth()
  const { flags, prefs } = useNotificationStore()
  const enquiries = useCollection<Enquiry>("enquiries")
  const quotations = useCollection<Quotation>("quotations")

  const effective = React.useMemo(() => allowedPrefs(prefs, profile), [prefs, profile])
  const now = useCoarseClock()

  // `now` is pinned per build rather than read inside the loop, so every item in
  // one pass agrees about what "today" is — a feed built across midnight
  // otherwise reads its own quotations as both expiring and expired.
  const all = React.useMemo(
    () =>
      buildNotifications({
        enquiries: enquiries.items,
        quotations: quotations.items,
        prefs: effective,
        now,
      }),
    [enquiries.items, quotations.items, effective, now],
  )

  const isRead = React.useCallback((id: string) => Boolean(flags[id]?.read), [flags])

  const unread = React.useMemo(() => all.filter((n) => !flags[n.id]?.read), [all, flags])

  const reload = React.useCallback(async () => {
    await Promise.all([enquiries.reload(), quotations.reload()])
  }, [enquiries, quotations])

  return {
    active: all,
    unread,
    all,
    unreadCount: unread.length,
    loading: enquiries.loading || quotations.loading,
    refreshing: enquiries.refreshing || quotations.refreshing,
    error: enquiries.error || quotations.error,
    reload,
    isRead,
    prefs: effective,
  }
}

/**
 * A clock that ticks every five minutes.
 *
 * The feed is time-dependent — an enquiry goes cold at two days, a quotation
 * expires at midnight — so a phone left open on a tab would otherwise keep
 * showing yesterday's verdict until something else re-rendered it. Reading
 * the clock straight in the render body would do the same job and is exactly
 * the impurity the lint rule exists to catch: two renders would disagree, and
 * the memo below would never settle.
 *
 * Five minutes, not one: nothing here changes faster than that, and four mounted
 * bells waking on a shared cadence is noise a phone does not need.
 */
const TICK_MS = 5 * 60 * 1000

function useCoarseClock(): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}
