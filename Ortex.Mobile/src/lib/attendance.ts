import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import type { AttendanceDay, Punch, PunchKind, PunchResult } from "@/domain/attendance"
import type { StaffDirectory } from "@/data/repo"
import { loadDirectory } from "@/hooks/useRecordHistory"

/**
 * Attendance, the data half: the scanned code and the server functions of
 * migration 0043. The phone reports what it scanned; the server decides
 * whether that code is live, whose it is and whether the punch counts.
 *
 * Nothing here reads a location, and nothing here uploads a photo. Since
 * 2026-09-20 attendance is proved by the rotating code on the office screen,
 * which means this file cannot leak a coordinate or a face even by mistake:
 * there is no code left that asks for either. `selfieUrl` survives only so the
 * history screens can still show the photos taken before that date.
 */

const BUCKET = "attendance-selfies"
const TTL_SECONDS = 3600

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
 * The phone could not reach the server at all (no signal, airplane mode, a
 * dropped request), as opposed to the server answering "no".
 *
 * There is no offline queue any more, and there cannot be one: a code is good
 * for thirty seconds and dies at its first scan, so a punch replayed an hour
 * later would be refused for a reason the person could do nothing about. A
 * scan with no signal fails at the gate, where it can be retried, rather than
 * appearing to succeed and being thrown away later.
 */
export class NetworkError extends Error {}

const NETWORK_RE = /network request failed|failed to fetch|network ?error|no connection|timed? ?out|aborted|unable to resolve host/i

export function isNetworkFailure(e: unknown): boolean {
  if (e instanceof NetworkError) return true
  const msg = (e as { message?: string } | null)?.message || String(e || "")
  return NETWORK_RE.test(msg)
}

export type PunchArgs = {
  id: string
  kind: PunchKind
  /**
   * What the camera read, verbatim. Null for a field punch, which has no
   * screen to scan and is recorded flagged for an admin.
   */
  payload: string | null
  note?: string
  /** Extra device facts for the admin. */
  device?: Record<string, unknown>
}

/** The device facts every punch carries. */
export const baseDevice = () => ({ platform: Platform.OS, appVersion: APP_VERSION })

/**
 * Clock in or out (attendance_punch). The answer is the server's, verbatim.
 * The punch id is made once per attempt, so a Retry after a dropped connection
 * returns the first answer again instead of burning a second code.
 */
export async function punch(a: PunchArgs): Promise<PunchResult> {
  let res
  try {
    res = await supabase.rpc("attendance_punch", {
      p_id: a.id,
      p_kind: a.kind,
      p_payload: a.payload,
      p_note: a.note?.trim() || null,
      p_device: { ...baseDevice(), ...(a.device || {}) },
    })
  } catch (e) {
    if (isNetworkFailure(e)) throw new NetworkError("No connection.")
    throw e
  }
  const { data, error } = res
  if (error) {
    if (isNetworkFailure(error) && !(error as { code?: string }).code) throw new NetworkError("No connection.")
    throw new Error(errorMessage(error, "Your clock-in was not saved. Try again."))
  }
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
  /** Seconds a code on the office screen is good for (0043). */
  qrRotateSec?: number
  /** Whether an office punch must carry a scanned code. */
  requireCode?: boolean
  /** IST times a check-in opens and closes (0049); a check-out has no window. */
  checkInFrom?: string
  closeAt?: string
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
