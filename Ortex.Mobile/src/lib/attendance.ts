import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@env"
import { Platform } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { errorMessage, supabase } from "@/data/supabase"
import {
  countFromFor,
  dayKey,
  onDutySince,
  summarizeDay,
  type AttendanceDay,
  type Punch,
  type PunchKind,
  type PunchResult,
  weeklyOffOf,
} from "@/domain/attendance"
import type { StaffDirectory } from "@/data/repo"
import { istWeekday } from "@/features/attendance/progress"
import type { TeamPerson } from "@/features/attendance/teamBoard"
import { loadDirectory } from "@/hooks/useRecordHistory"

/**
 * The server's clock less the phone's, learned from attendance_punch answers.
 * A phone set to the wrong date would otherwise draw yesterday's day, refuse a
 * check-in the server allows and hide the check-out. Only a quick round trip is
 * trusted, so a slow network cannot skew it. In memory: each session learns it
 * first from learnServerClock() (a Date header), then from every punch.
 */
let clockOffset = 0
const TRUSTED_RTT_MS = 3000

/** Now, by the server's clock as far as this phone has learned it. */
export const serverNow = () => Date.now() + clockOffset

/**
 * Learn the server's clock before the first punch, from the Date header of a
 * cheap request (whole seconds, enough for a check-in window). Once a session;
 * a punch's own answer, which is finer, replaces it. Never throws.
 */
let clockLearned = false
export async function learnServerClock(): Promise<void> {
  if (clockLearned || !SUPABASE_URL) return
  try {
    const sentAt = Date.now()
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY || "" } })
    const back = Date.now()
    const at = Date.parse(res.headers.get("date") || "")
    if (Number.isFinite(at) && back - sentAt < TRUSTED_RTT_MS) {
      // The header drops the milliseconds: add half a second back on average.
      clockOffset = at + 500 - (sentAt + back) / 2
      clockLearned = true
    }
  } catch {
    // Offline: the phone's clock it is until the next try or punch.
  }
}

/**
 * Attendance, the data half: the scanned code and the server functions of
 * migration 0043. The phone reports what it scanned; the server decides
 * whether that code is live, whose it is and whether the punch counts.
 *
 * Nothing here reads a location, and nothing here uploads a photo. Since
 * 2026-09-20 attendance is proved by the rotating code on the office screen,
 * which means this file cannot leak a coordinate or a face even by mistake:
 * there is no code left that asks for either. The last photos taken before that
 * date, and the code that displayed them, were deleted on 2026-09-30
 * (Ortex.Admin migration 0060).
 */

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
  const sentAt = Date.now()
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
  const r = data as PunchResult
  const back = Date.now()
  // A replay carries the first punch's time, not the server's now.
  if (r?.at && !r.repeat && back - sentAt < TRUSTED_RTT_MS) {
    const at = Date.parse(r.at)
    if (Number.isFinite(at)) {
      clockOffset = at - (sentAt + back) / 2
      clockLearned = true
    }
  }
  return r
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
  /** People present on every working day without punching (0056). */
  autoPresent?: string[]
  weeklyOff?: number[]
}

/**
 * The Super Admin's attendance settings (readable by all staff). No row reads
 * as {} (nothing set yet); a failed read THROWS, because defaults in its place
 * would remind people on the wrong shift, and remind the present-by-default.
 */
export async function loadSettings(): Promise<AttendanceSettings> {
  const { data, error } = await supabase.from("attendance_settings").select("doc").maybeSingle()
  if (error) throw new Error(errorMessage(error, "Could not load the attendance settings."))
  return ((data?.doc as AttendanceSettings | null) || {}) as AttendanceSettings
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

/**
 * How many decisions wait for an admin (corrections, flagged punches of the
 * last 30 days, leave), as count-only reads: the badge needs a number, not rows.
 */
export async function pendingApprovalsCount(): Promise<number> {
  const since = dayKey(Date.now() - 30 * 86400000)
  const head = { count: "exact" as const, head: true }
  const answers = await Promise.all([
    supabase.from("regularisations").select("id", head).eq("status", "pending"),
    supabase.from("attendance_punches").select("id", head).eq("review", "flagged").gte("day", since),
    supabase.from("leave_requests").select("id", head).eq("status", "pending"),
  ])
  for (const a of answers) if (a.error) throw fail(a.error, "Could not count the approvals.")
  return answers.reduce((n, a) => n + (a.count || 0), 0)
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

export type TeamMember = TeamPerson

export type TeamDay = {
  people: TeamMember[]
  settings: AttendanceSettings & { weeklyOff?: number[] }
  /** Why nobody is expected today ("Weekly off", a holiday's name), or null. */
  off: string | null
}

/**
 * Admins: today's team as the console's Attendance → Today reads it. Every
 * active account (and anyone who punched), with today's punches, approved
 * leave and the "present by default" list, plus whether today is a day off.
 */
export async function teamToday(now = serverNow()): Promise<TeamDay> {
  const today = dayKey(now)
  // profiles already carries the name and photo; the staff directory would be
  // a second read of the same people.
  const [punches, profiles, leave, settings, hols] = await Promise.all([
    supabase.from("attendance_punches").select("*").eq("day", today).limit(1000),
    supabase.from("profiles").select("id, name, email, avatar_url, active, phone"),
    supabase
      .from("leave_requests")
      .select("user_id, type_code, from_day, to_day, from_half, to_half")
      .eq("status", "approved")
      .lte("from_day", today)
      .gte("to_day", today),
    loadSettings(),
    holidays({ from: today, to: today }),
  ])
  // A failed read must say so: a board quietly missing people reads as "all in".
  if (punches.error) throw fail(punches.error, "Could not load today's attendance.")
  if (profiles.error) throw fail(profiles.error, "Could not load the team.")
  if (leave.error) throw fail(leave.error, "Could not load today's leave.")
  const by = new Map<string, Punch[]>()
  for (const p of (punches.data || []) as Punch[]) {
    if (!by.has(p.user_id)) by.set(p.user_id, [])
    by.get(p.user_id)!.push(p)
  }
  type Leave = { user_id: string; type_code: string; from_day: string; to_day: string; from_half: string; to_half: string }
  const halfToday = (l: Leave) => (l.from_day === today && l.from_half === "second") || (l.to_day === today && l.to_half === "first")
  // Two approved rows for one person (a morning half and an afternoon half, say):
  // a full-day row wins, so nobody on leave all day reads as half in.
  const onLeave = new Map<string, Leave>()
  for (const l of (leave.data || []) as Leave[]) {
    const seen = onLeave.get(l.user_id)
    if (!seen || (halfToday(seen) && !halfToday(l))) onLeave.set(l.user_id, l)
  }
  type Row = { id: string; name: string | null; email: string | null; avatar_url: string | null; active: boolean; phone?: string | null }
  const rows = (profiles.data || []) as Row[]
  const ids = new Set([...rows.filter((p) => p.active).map((p) => p.id), ...by.keys()])
  const auto = new Set(settings.autoPresent || [])
  // An optional holiday is one people may take, not a day the office is shut.
  const holiday = hols.find((h) => h.kind !== "optional")
  const isHoliday = !!holiday
  const people = [...ids].map((userId): TeamMember => {
    const prof = rows.find((p) => p.id === userId)
    const list = by.get(userId) || []
    const l = onLeave.get(userId)
    return {
      userId,
      name: prof?.name?.trim() || prof?.email || "A colleague",
      avatarUrl: prof?.avatar_url || "",
      phone: prof?.phone || "",
      summary: summarizeDay(today, list, now, countFromFor(settings, today, isHoliday)),
      onDuty: Boolean(onDutySince(list, now)),
      leave: l ? { code: l.type_code, half: halfToday(l) } : null,
      autoPresent: auto.has(userId),
    }
  })
  const off = holiday?.name || (weeklyOffOf(settings).includes(istWeekday(today)) ? "Weekly off" : null)
  return { people, settings, off }
}

export async function reviewPunch(id: string, decision: "accepted" | "rejected", note?: string): Promise<void> {
  const { error } = await supabase.rpc("attendance_review", {
    p_id: id,
    p_decision: decision,
    p_note: note?.trim() || null,
  })
  if (error) throw fail(error, "The review was not saved. Try again.")
}
