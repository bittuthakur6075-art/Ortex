import AsyncStorage from "@react-native-async-storage/async-storage"
import * as FileSystem from "expo-file-system/legacy"
import React from "react"

import { selfiePath, type Punch, type PunchKind, type PunchResult } from "@/domain/attendance"
import { isNetworkFailure, punch, uploadSelfieBase64, type Reading } from "@/lib/attendance"

/**
 * Clock-ins made with no signal (attendance plan §2.6, "offline").
 *
 * A punch that could not REACH the server (not one the server refused) is kept
 * on the phone: the resized selfie as a file under documentDirectory, the rest
 * in AsyncStorage per person. It is sent the moment the phone is back online
 * (AttendanceQueueSync: foreground, network change, screen focus), with
 * p_offline and the time it was really made. The server flags every offline
 * punch for review and keeps that time only if it is believable (under 24 h);
 * after that it uses its own clock, so an old entry is still sent, never lost.
 *
 * The punch id is made before the first attempt and reused on every send, so a
 * send whose answer was lost on the way back can never count twice: the server
 * returns its first answer again.
 *
 * This is a narrow, deliberate exception to "writes are never queued offline"
 * (CLAUDE.md): attendance is the one write a rep must be able to make from a
 * factory floor with no signal.
 */

export type QueuedPunch = {
  id: string
  kind: PunchKind
  reading: Reading
  clientAt: string
  note?: string
  device: Record<string, unknown>
  userId: string
  file: string
}

type State = { items: QueuedPunch[]; syncing: boolean; lastIssue: string | null }

const DIR = `${FileSystem.documentDirectory ?? ""}attendance-queue/`
const key = (uid: string) => `@ortex/attendance-queue/${uid}`

let current: { uid: string; state: State } | null = null
const listeners = new Set<() => void>()
const EMPTY: State = { items: [], syncing: false, lastIssue: null }

function set(uid: string, next: Partial<State>) {
  const base = current && current.uid === uid ? current.state : EMPTY
  current = { uid, state: { ...base, ...next } }
  listeners.forEach((l) => l())
}

async function persist(uid: string, items: QueuedPunch[]) {
  await AsyncStorage.setItem(key(uid), JSON.stringify(items)).catch(() => {})
}

/** Read this person's queue from the phone. */
export async function loadQueue(uid: string): Promise<QueuedPunch[]> {
  if (!uid) return []
  if (current?.uid === uid) return current.state.items
  try {
    const raw = await AsyncStorage.getItem(key(uid))
    const items = raw ? (JSON.parse(raw) as QueuedPunch[]) : []
    set(uid, { items })
    return items
  } catch {
    set(uid, { items: [] })
    return []
  }
}

/** Keep a punch that could not reach the server. `preparedUri` is the resized selfie. */
export async function enqueue(entry: Omit<QueuedPunch, "file">, preparedUri: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {})
  const file = `${DIR}${entry.id}.jpg`
  await FileSystem.copyAsync({ from: preparedUri, to: file })
  const items = (await loadQueue(entry.userId)).filter((q) => q.id !== entry.id)
  items.push({ ...entry, file })
  set(entry.userId, { items, lastIssue: null })
  await persist(entry.userId, items)
}

async function drop(uid: string, id: string) {
  const items = (current?.uid === uid ? current.state.items : await loadQueue(uid)).filter((q) => q.id !== id)
  set(uid, { items })
  await persist(uid, items)
  await FileSystem.deleteAsync(`${DIR}${id}.jpg`, { idempotent: true }).catch(() => {})
}

/**
 * Send everything waiting, oldest first. Stops at the first network failure
 * (still offline) and keeps the rest. Any answer from the server, including a
 * refusal, removes the entry: the server has decided it, and the day screen
 * shows what it said.
 */
export async function syncQueue(uid: string): Promise<{ sent: number; results: PunchResult[] }> {
  if (!uid) return { sent: 0, results: [] }
  const items = [...(await loadQueue(uid))].sort((a, b) => a.clientAt.localeCompare(b.clientAt))
  if (!items.length || current?.state.syncing) return { sent: 0, results: [] }
  set(uid, { syncing: true })
  const results: PunchResult[] = []
  let sent = 0
  try {
    for (const q of items) {
      try {
        const base64 = await FileSystem.readAsStringAsync(q.file, { encoding: FileSystem.EncodingType.Base64 })
        const path = selfiePath(uid, q.id, new Date(q.clientAt))
        await uploadSelfieBase64(base64, path)
        const res = await punch({
          id: q.id,
          kind: q.kind,
          reading: q.reading,
          selfiePath: path,
          note: q.note,
          clientAt: q.clientAt,
          offline: true,
          device: q.device,
        })
        results.push(res)
        sent += 1
        await drop(uid, q.id)
      } catch (e) {
        if (isNetworkFailure(e)) break
        // The server (or the phone's own file) refused it for good. Keep the
        // reason on screen rather than retrying forever.
        set(uid, { lastIssue: e instanceof Error ? e.message : "A saved clock-in could not be sent." })
        await drop(uid, q.id)
      }
    }
  } finally {
    set(uid, { syncing: false })
  }
  return { sent, results }
}

/** The waiting clock-ins as Punch rows, so the day and the ring include them. */
export function queuedAsPunches(items: QueuedPunch[]): Punch[] {
  return items.map((q) => ({
    id: q.id,
    user_id: q.userId,
    kind: q.kind,
    at: q.clientAt,
    day: dayOf(q.clientAt),
    mode: "office",
    offline: true,
    flags: ["offline"],
    review: "ok",
    note: q.note || null,
  }))
}

function dayOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10)
}

/** Live view of this person's queue. */
export function useAttendanceQueue(uid: string | undefined): State & { sendNow: () => Promise<void> } {
  const snapshot = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => (uid && current?.uid === uid ? current.state : EMPTY),
  )
  React.useEffect(() => {
    if (uid) void loadQueue(uid)
  }, [uid])
  const sendNow = React.useCallback(async () => {
    if (uid) await syncQueue(uid)
  }, [uid])
  return { ...snapshot, sendNow }
}

/** For signing out: forget the in-memory copy (the stored queue stays with the person). */
export function resetQueueState() {
  current = null
  listeners.forEach((l) => l())
}
