import * as ImageManipulator from "expo-image-manipulator"
import * as Location from "expo-location"
import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import type { AttendanceDay, LocationCheck, Punch, PunchKind, PunchResult } from "@/domain/attendance"
import type { StaffDirectory } from "@/data/repo"
import { loadDirectory } from "@/hooks/useRecordHistory"
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
  lateRule?: { count?: number; deductDays?: number }
  correctionsPerMonth?: number
  saturday?: "full" | "half"
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

// ---- phase 2: days, corrections, holidays, approvals (migration 0034) ------------------------

export const NOT_SET_UP = "Attendance rules are not set up on the server yet."

/**
 * One message for every failure. A table or function that does not exist yet
 * (0034 not applied to this project) is a set-up gap, not the person's fault,
 * and says so instead of printing a Postgres error code.
 */
function fail(error: unknown, fallback: string): Error {
  const e = error as { code?: string; message?: string } | null
  const msg = e?.message || ""
  if (
    e?.code === "42P01" ||
    e?.code === "42883" ||
    e?.code === "PGRST202" ||
    e?.code === "PGRST205" ||
    /does not exist|could not find the (table|function)|schema cache/i.test(msg)
  ) {
    return new Error(NOT_SET_UP)
  }
  return new Error(errorMessage(error, fallback))
}

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** What each of my days counts as, between two IST days (inclusive). */
export async function myDays({ from, to }: { from: string; to: string }): Promise<AttendanceDay[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("attendance_days")
    .select("*")
    .eq("user_id", uid)
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: false })
  if (error) throw fail(error, "Could not load your attendance.")
  return (data || []) as AttendanceDay[]
}

export type CorrectionStatus = "pending" | "approved" | "rejected" | "cancelled"

export type Correction = {
  id: string
  user_id: string
  day: string
  in_at: string | null
  out_at: string | null
  reason: string
  status: CorrectionStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

/** My correction requests whose day falls in a range. */
export async function myCorrections({ from, to }: { from: string; to: string }): Promise<Correction[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("regularisations")
    .select("*")
    .eq("user_id", uid)
    .gte("day", from)
    .lte("day", to)
    .order("created_at", { ascending: false })
  if (error) throw fail(error, "Could not load your corrections.")
  return (data || []) as Correction[]
}

/** "I forgot to clock out at 6:30": the person's own request (regularise_request). */
export async function requestCorrection(a: {
  day: string
  inAt: string | null
  outAt: string | null
  reason: string
}): Promise<string> {
  const { data, error } = await supabase.rpc("regularise_request", {
    p_day: a.day,
    p_in_at: a.inAt,
    p_out_at: a.outAt,
    p_reason: a.reason.trim(),
  })
  if (error) throw fail(error, "Your correction was not sent. Try again.")
  return data as string
}

export async function cancelCorrection(id: string): Promise<void> {
  const { error } = await supabase.rpc("regularise_cancel", { p_id: id })
  if (error) throw fail(error, "Could not cancel the correction.")
}

export type Holiday = { id: string; day: string; name: string; kind: "national" | "festival" | "optional"; active: boolean }

/** Active holidays between two days, soonest first. */
export async function holidays({ from, to }: { from: string; to: string }): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .eq("active", true)
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true })
  if (error) throw fail(error, "Could not load the holidays.")
  return (data || []) as Holiday[]
}

/** Is the month of this day locked for payroll? A missing table reads as "not locked". */
export async function monthLocked(day: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("attendance_months")
    .select("month")
    .eq("month", `${day.slice(0, 7)}-01`)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

// ---- admins -----------------------------------------------------------------------------------

export type PendingCorrection = Correction & { person: string; avatarUrl: string }

const nameOf = (dir: StaffDirectory, id: string) => dir[id]?.name || "A colleague"

/** Every correction waiting for an admin, oldest first, with the requester's name. */
export async function pendingCorrections(): Promise<PendingCorrection[]> {
  const [{ data, error }, dir] = await Promise.all([
    supabase.from("regularisations").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    loadDirectory(),
  ])
  if (error) throw fail(error, "Could not load the corrections.")
  return ((data || []) as Correction[]).map((c) => ({
    ...c,
    person: nameOf(dir, c.user_id),
    avatarUrl: dir[c.user_id]?.avatarUrl || "",
  }))
}

export async function decideCorrection(id: string, approve: boolean, note?: string): Promise<void> {
  const { error } = await supabase.rpc("regularise_decide", {
    p_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  })
  if (error) throw fail(error, "The decision was not saved. Try again.")
}

export type FlaggedPunch = Punch & { person: string; avatarUrl: string }

/** Punches waiting for review from the last 30 days, newest first. */
export async function flaggedPunches(): Promise<FlaggedPunch[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [{ data, error }, dir] = await Promise.all([
    supabase
      .from("attendance_punches")
      .select("*")
      .eq("review", "flagged")
      .gte("day", since)
      .order("at", { ascending: false })
      .limit(200),
    loadDirectory(),
  ])
  if (error) throw fail(error, "Could not load the punches to review.")
  return ((data || []) as Punch[]).map((p) => ({
    ...p,
    person: nameOf(dir, p.user_id),
    avatarUrl: dir[p.user_id]?.avatarUrl || "",
  }))
}

export async function reviewPunch(id: string, decision: "accepted" | "rejected", note?: string): Promise<void> {
  const { error } = await supabase.rpc("attendance_review", {
    p_id: id,
    p_decision: decision,
    p_note: note?.trim() || null,
  })
  if (error) throw fail(error, "The review was not saved. Try again.")
}
