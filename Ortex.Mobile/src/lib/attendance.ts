import * as ImageManipulator from "expo-image-manipulator"
import * as Location from "expo-location"
import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import type { LocationCheck, Punch, PunchKind, PunchResult } from "@/domain/attendance"
import { decodeBase64 } from "@/lib/avatarUpload"

/**
 * Attendance, the data half: the one location reading, the selfie upload, and
 * the two server functions of migration 0033. The phone reports; the server
 * decides (distance, time, whether it counts). Nothing here computes a fence.
 */

const BUCKET = "attendance-selfies"
const TTL_SECONDS = 3600
const READING_TIMEOUT_MS = 15000

export type Reading = { lat: number; lng: number; accuracy: number; mocked: boolean }

export type ReadingError = "permission" | "services_off" | "timeout" | "failed"

export class LocationError extends Error {
  constructor(public reason: ReadingError, message: string) {
    super(message)
  }
}

/** Ask for (foreground) location permission. True when granted. */
export async function requestLocationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const res = await Location.requestForegroundPermissionsAsync()
  return { granted: res.granted, canAskAgain: res.canAskAgain }
}

/**
 * ONE reading, at the moment of clocking in. Never a watch, never background:
 * attendance must not become tracking (plan §2.2, DPDP).
 */
export async function getReading(): Promise<Reading> {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (!perm.granted) {
    throw new LocationError("permission", "Location is off for Ortex. Allow it to clock in.")
  }
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    throw new LocationError("services_off", "Your phone's location is switched off. Turn it on to clock in.")
  }
  const read = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: true,
  })
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new LocationError("timeout", "Finding your location is taking too long. Move near a window and try again.")),
      READING_TIMEOUT_MS,
    ),
  )
  try {
    const pos = await Promise.race([read, timeout])
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      // Android always reports one; treat a missing value as poor, not perfect.
      accuracy: pos.coords.accuracy ?? 999,
      mocked: Boolean(pos.mocked),
    }
  } catch (e) {
    if (e instanceof LocationError) throw e
    throw new LocationError("failed", "Your location could not be read. Try again.")
  }
}

/** "How far am I?" before any punch (attendance_check). */
export async function check(r: Reading): Promise<LocationCheck> {
  const { data, error } = await supabase.rpc("attendance_check", {
    p_lat: r.lat,
    p_lng: r.lng,
    p_accuracy: r.accuracy,
  })
  if (error) throw new Error(errorMessage(error, "Could not check your location with the office."))
  return data as LocationCheck
}

/** A v4 uuid for a punch: made once per attempt so a retry never punches twice. */
export function newPunchId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  const hex = "0123456789abcdef"
  let out = ""
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-"
    else if (i === 14) out += "4"
    else if (i === 19) out += hex[(Math.random() * 4) | 8]
    else out += hex[(Math.random() * 16) | 0]
  }
  return out
}

/**
 * Resize to 640 px on the long edge, JPEG 0.6 (≈60 KB), and upload into the
 * caller's own folder. Bytes travel as base64 for the reason productImages.ts
 * gives: an RN Blob uploads a 0-byte object without an error.
 */
export async function uploadSelfie(localUri: string, width: number, height: number, path: string): Promise<void> {
  if (!hasSupabase) throw new Error("Not connected")
  const resize = width >= height ? { width: Math.min(640, width || 640) } : { height: Math.min(640, height || 640) }
  const out = await ImageManipulator.manipulateAsync(localUri, [{ resize }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!out.base64) throw new Error("The selfie could not be prepared. Take it again.")
  const bytes = decodeBase64(out.base64)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: "image/jpeg",
    upsert: false,
  })
  // A retry of an attempt whose upload landed before the punch failed.
  if (error && !/already exists|duplicate/i.test(error.message || "")) {
    if (/bucket not found/i.test(error.message || "")) {
      throw new Error("Attendance is not set up on this environment yet. Tell the office.")
    }
    throw new Error(errorMessage(error, "The selfie did not upload. Try again."))
  }
}

export type PunchArgs = {
  id: string
  kind: PunchKind
  reading: Reading
  selfiePath: string
  note?: string
}

/** Clock in or out (attendance_punch). The answer is the server's, verbatim. */
export async function punch(a: PunchArgs): Promise<PunchResult> {
  const { data, error } = await supabase.rpc("attendance_punch", {
    p_id: a.id,
    p_kind: a.kind,
    p_lat: a.reading.lat,
    p_lng: a.reading.lng,
    p_accuracy: a.reading.accuracy,
    p_mocked: a.reading.mocked,
    p_client_at: new Date().toISOString(),
    p_selfie_path: a.selfiePath,
    p_note: a.note?.trim() || null,
    p_offline: false,
    p_device: { platform: Platform.OS, appVersion: APP_VERSION },
  })
  if (error) throw new Error(errorMessage(error, "Your clock-in was not saved. Try again."))
  return data as PunchResult
}

/** The signed-in person's own punches, newest first, between two IST days. */
export async function myPunches({ from, to }: { from: string; to?: string }): Promise<Punch[]> {
  const { data: auth } = await supabase.auth.getSession()
  const uid = auth.session?.user.id
  if (!uid) return []
  let q = supabase
    .from("attendance_punches")
    .select("*")
    .eq("user_id", uid)
    .gte("day", from)
    .order("at", { ascending: false })
    .limit(1000)
  if (to) q = q.lte("day", to)
  const { data, error } = await q
  if (error) throw new Error(errorMessage(error, "Could not load your attendance."))
  return (data || []) as Punch[]
}

export type AttendanceSettings = {
  shift?: { start?: string; end?: string }
  graceMin?: number
  notice?: string
  maxAccuracyM?: number
  mustBeInside?: boolean
}

/** The Super Admin's attendance settings (readable by all staff). */
export async function loadSettings(): Promise<AttendanceSettings> {
  const { data, error } = await supabase.from("attendance_settings").select("doc").maybeSingle()
  if (error || !data) return {}
  return (data.doc || {}) as AttendanceSettings
}

/** A 1-hour URL for a selfie, or null when it is gone (retention) or refused. */
export async function selfieUrl(path?: string | null): Promise<string | null> {
  if (!hasSupabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error) return null
  return data?.signedUrl || null
}

/** 09:30 → 9:30 AM, for the shift line. */
export function shiftClock(hhmm?: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return ""
  const [h, m] = hhmm.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}
