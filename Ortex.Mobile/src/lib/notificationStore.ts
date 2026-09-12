import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"

import { DEFAULT_PREFS, type NotificationPrefs } from "@/domain/notifications"

/**
 * What this handset knows about its own notifications: which have been read,
 * which have been archived, which have already been pushed to the shade, and
 * which signals the rep wants at all.
 *
 * It is LOCAL, exactly as the console's drawer is (its flags live in
 * localStorage under `ortex.admin.notifications`). A notification is derived
 * from a record, not stored beside it, so "I have seen this" is a fact about a
 * person and a device — writing it to the shared `enquiries` row would mark a
 * lead read for the whole team the moment one rep glanced at it.
 *
 * The shape is a module-level store with subscribers rather than a context, the
 * same pattern lib/favourites.ts uses: the bell in the app bar, the list and the
 * background engine all read and write it, and all three must repaint.
 */

const FLAGS_KEY = "ortex.notifications.flags"
const PREFS_KEY = "ortex.notifications.prefs"

export type NotificationFlags = {
  read?: boolean
  archived?: boolean
  /**
   * This item has already been posted to the notification shade. It is what
   * stops a re-fetch, a pull-to-refresh or a cold start from ringing the phone
   * about a lead it announced yesterday.
   */
  pushed?: boolean
}

let flags: Record<string, NotificationFlags> = {}
let prefs: NotificationPrefs = { ...DEFAULT_PREFS }
let hydrated = false
let hydrating: Promise<void> | null = null

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function persistFlags() {
  AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(flags)).catch(() => {})
}

function persistPrefs() {
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {})
}

/** Reads both blobs once. Every public reader awaits this before it matters. */
export function hydrateNotifications(): Promise<void> {
  if (hydrated) return Promise.resolve()
  if (hydrating) return hydrating
  hydrating = (async () => {
    try {
      const [rawFlags, rawPrefs] = await AsyncStorage.multiGet([FLAGS_KEY, PREFS_KEY])
      if (rawFlags[1]) flags = JSON.parse(rawFlags[1]) as Record<string, NotificationFlags>
      if (rawPrefs[1]) prefs = { ...DEFAULT_PREFS, ...(JSON.parse(rawPrefs[1]) as NotificationPrefs) }
    } catch {
      // A corrupt blob just means "nothing read yet" — never a blocked app.
    }
    hydrated = true
    emit()
  })()
  return hydrating
}

export const notificationFlags = () => flags
export const isRead = (id: string) => Boolean(flags[id]?.read)
export const isArchived = (id: string) => Boolean(flags[id]?.archived)
export const wasPushed = (id: string) => Boolean(flags[id]?.pushed)

function patch(id: string, next: NotificationFlags) {
  flags = { ...flags, [id]: { ...(flags[id] || {}), ...next } }
}

export function markRead(id: string, read = true) {
  patch(id, { read })
  persistFlags()
  emit()
}

export function markArchived(id: string, archived = true) {
  // Archiving is also reading it: an archived row should never come back as an
  // unread count on the bell.
  patch(id, { archived, read: true })
  persistFlags()
  emit()
}

export function markAllRead(ids: string[]) {
  for (const id of ids) patch(id, { read: true })
  persistFlags()
  emit()
}

/**
 * Record that these ids have been announced. Called by the push engine both for
 * what it just posted AND, on a first run, for the whole existing feed — see
 * features/notifications/useNotificationEngine.ts for why silently marking the
 * backlog is the only sane first launch.
 */
export function markPushed(ids: string[]) {
  if (!ids.length) return
  for (const id of ids) patch(id, { pushed: true })
  persistFlags()
  emit()
}

/**
 * Drop flags for signals that no longer exist. Ids are deterministic, so a
 * quotation that was extended or an enquiry that was answered leaves its flag
 * behind forever otherwise — a slow leak in a blob that is read on every launch.
 */
export function pruneFlags(liveIds: string[]) {
  const live = new Set(liveIds)
  const next: Record<string, NotificationFlags> = {}
  let dropped = false
  for (const [id, value] of Object.entries(flags)) {
    if (live.has(id)) next[id] = value
    else dropped = true
  }
  if (!dropped) return
  flags = next
  persistFlags()
  emit()
}

export const notificationPrefs = () => prefs

export function setNotificationPrefs(next: Partial<NotificationPrefs>) {
  prefs = { ...prefs, ...next }
  persistPrefs()
  emit()
}

/** Live flags + prefs. Re-renders the caller whenever anything changes. */
export function useNotificationStore(): {
  flags: Record<string, NotificationFlags>
  prefs: NotificationPrefs
  hydrated: boolean
} {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener)
    void hydrateNotifications()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  // One frozen snapshot object per change, because useSyncExternalStore compares
  // by identity and a fresh object every call is an infinite render.
  const getSnapshot = React.useCallback(() => snapshot(), [])
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

let cached = { flags, prefs, hydrated }
function snapshot() {
  if (cached.flags !== flags || cached.prefs !== prefs || cached.hydrated !== hydrated) {
    cached = { flags, prefs, hydrated }
  }
  return cached
}

/**
 * Forget what this handset had read, and clear the shade.
 *
 * Called on sign-out. Flags are keyed by record id, so leaving them behind would
 * hand the NEXT person to sign in on this phone a feed where half the leads are
 * already "read" and never announce the ones the previous rep had seen.
 * Preferences are kept: they are a property of the handset, not the account.
 */
export function resetNotificationState() {
  flags = {}
  AsyncStorage.removeItem(FLAGS_KEY).catch(() => {})
  emit()
}
