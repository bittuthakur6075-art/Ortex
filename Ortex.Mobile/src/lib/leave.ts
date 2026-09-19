import * as ImageManipulator from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"

import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import type { StaffDirectory } from "@/data/repo"
import type { FromHalf, LeaveBalance, LeaveRequest, ToHalf } from "@/domain/attendance"
import { loadDirectory } from "@/hooks/useRecordHistory"
import { decodeBase64 } from "@/lib/avatarUpload"
import { newPunchId } from "@/lib/attendance"

/**
 * Leave, the data half (migration 0036). The SERVER counts the days, checks the
 * balance, the overlaps, the notice and the certificate rule, and writes the
 * ledger; the phone only asks and shows. Errors from leave_apply are written
 * for people ("CL can be at most 3 days in a row"), so they are shown verbatim.
 */

const BUCKET = "leave-documents"
const TTL_SECONDS = 3600

export const LEAVE_NOT_SET_UP = "Leave is not set up on the server yet."

/** A table or function that does not exist yet (0036 not applied) is a set-up gap, not an error to decode. */
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
    return new Error(LEAVE_NOT_SET_UP)
  }
  return new Error(errorMessage(error, fallback))
}

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export type LeaveType = {
  code: string
  name: string
  annual: number
  accrual: "monthly" | "upfront" | "manual" | "none"
  carry_max: number
  half_day: boolean
  max_run: number | null
  notice_days: number
  doc_after_days: number | null
  paid: boolean
  expires_days: number | null
  active: boolean
  sort: number
}

export type LedgerRow = {
  id: string
  user_id: string
  type_code: string
  delta: number
  reason: "accrual" | "grant" | "taken" | "reversal" | "lapse" | "adjust"
  period: string | null
  ref_id: string | null
  note: string | null
  at: string
}

/** Numeric columns arrive as strings from PostgREST; make them numbers once, here. */
const num = (v: unknown) => (v == null ? 0 : Number(v))

/** My balance per leave type (or someone else's, for an admin). */
export async function balances(userId?: string): Promise<LeaveBalance[]> {
  const { data, error } = await supabase.rpc("leave_balances", userId ? { p_user: userId } : {})
  if (error) throw fail(error, "Could not load leave balances.")
  return ((data || []) as LeaveBalance[]).map((b) => ({
    ...b,
    balance: num(b.balance),
    pending: num(b.pending),
    available: num(b.available),
    taken_year: num(b.taken_year),
    annual: num(b.annual),
  }))
}

export async function types(): Promise<LeaveType[]> {
  const { data, error } = await supabase.from("leave_types").select("*").eq("active", true).order("sort")
  if (error) throw fail(error, "Could not load the leave types.")
  return ((data || []) as LeaveType[]).map((t) => ({ ...t, annual: num(t.annual), carry_max: num(t.carry_max) }))
}

const toRequest = (r: LeaveRequest): LeaveRequest => ({ ...r, days: num(r.days) })

/** My requests, newest first (last 18 months is plenty for the phone). */
export async function myRequests(): Promise<LeaveRequest[]> {
  const uid = await myId()
  if (!uid) return []
  const since = new Date(Date.now() - 540 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("user_id", uid)
    .gte("to_day", since)
    .order("created_at", { ascending: false })
  if (error) throw fail(error, "Could not load your leave requests.")
  return ((data || []) as LeaveRequest[]).map(toRequest)
}

export async function getRequest(id: string): Promise<LeaveRequest | null> {
  const { data, error } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle()
  if (error) throw fail(error, "Could not load that request.")
  return data ? toRequest(data as LeaveRequest) : null
}

/** My ledger, newest first; one type or all. */
export async function myLedger(code?: string): Promise<LedgerRow[]> {
  const uid = await myId()
  if (!uid) return []
  let q = supabase.from("leave_ledger").select("*").eq("user_id", uid).order("at", { ascending: false }).limit(500)
  if (code) q = q.eq("type_code", code)
  const { data, error } = await q
  if (error) throw fail(error, "Could not load the balance history.")
  return ((data || []) as LedgerRow[]).map((r) => ({ ...r, delta: num(r.delta) }))
}

// ---- the certificate ------------------------------------------------------------------------------

export type Attachment = { uri: string; base64: string; width: number; height: number }

/**
 * Pick a certificate photo (camera or gallery). PDFs are not offered: the app
 * ships no document picker, and a photo of the paper is what reps have.
 */
export async function pickAttachment(source: "camera" | "library"): Promise<Attachment | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error(source === "camera" ? "Camera is off for Ortex." : "Photos are off for Ortex.")
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 }
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  // 1600 px on the long edge keeps a certificate readable and well under 5 MB.
  const w = a.width || 1600
  const h = a.height || 1600
  const resize = w >= h ? { width: Math.min(1600, w) } : { height: Math.min(1600, h) }
  const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!out.base64) throw new Error("The photo could not be prepared. Try again.")
  return { uri: out.uri, base64: out.base64, width: out.width, height: out.height }
}

/** Upload into my own folder: <uid>/<yyyy>/<uuid>.jpg. Returns the path. */
async function uploadAttachment(a: Attachment): Promise<string> {
  if (!hasSupabase) throw new Error("Not connected")
  const uid = await myId()
  if (!uid) throw new Error("Sign in again to attach a document.")
  const path = `${uid}/${new Date().getFullYear()}/${newPunchId()}.jpg`
  const bytes = decodeBase64(a.base64)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg", upsert: false })
  if (error) {
    if (/bucket not found/i.test(error.message || "")) throw new Error(LEAVE_NOT_SET_UP)
    throw new Error(errorMessage(error, "The document did not upload. Try again."))
  }
  return path
}

/** A 1-hour link to a certificate, or null when it is gone or refused. */
export async function attachmentUrl(path?: string | null): Promise<string | null> {
  if (!hasSupabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error) return null
  return data?.signedUrl || null
}

// ---- apply / cancel ---------------------------------------------------------------------------------

export type ApplyArgs = {
  type: string
  from: string
  to: string
  fromHalf: FromHalf
  toHalf: ToHalf
  reason: string
  attachment?: Attachment | null
}

/** Ask for leave (leave_apply). The server's refusal is the message shown. */
export async function apply(a: ApplyArgs): Promise<{ id: string; days: number }> {
  const path = a.attachment ? await uploadAttachment(a.attachment) : null
  const { data, error } = await supabase.rpc("leave_apply", {
    p_type: a.type,
    p_from: a.from,
    p_to: a.to,
    p_from_half: a.fromHalf,
    p_to_half: a.toHalf,
    p_reason: a.reason.trim(),
    p_attachment: path,
  })
  if (error) throw fail(error, "Your request was not sent. Try again.")
  const r = (data || {}) as { id: string; days: number | string }
  return { id: r.id, days: num(r.days) }
}

export async function cancel(id: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("leave_cancel", { p_id: id, p_note: note?.trim() || null })
  if (error) throw fail(error, "Could not cancel the request.")
}

// ---- admins ---------------------------------------------------------------------------------------

export type NamedLeave = LeaveRequest & { person: string; avatarUrl: string }

const named = (dir: StaffDirectory, r: LeaveRequest): NamedLeave => ({
  ...toRequest(r),
  person: dir[r.user_id]?.name || "A colleague",
  avatarUrl: dir[r.user_id]?.avatarUrl || "",
})

/** Every leave request waiting for an admin, oldest first. */
export async function pendingLeave(): Promise<NamedLeave[]> {
  const [{ data, error }, dir] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    loadDirectory(),
  ])
  if (error) throw fail(error, "Could not load the leave requests.")
  return ((data || []) as LeaveRequest[]).map((r) => named(dir, r))
}

export async function decideLeave(id: string, approve: boolean, note?: string): Promise<void> {
  const { error } = await supabase.rpc("leave_decide", { p_id: id, p_approve: approve, p_note: note?.trim() || null })
  if (error) throw fail(error, "The decision was not saved. Try again.")
}

/** Approved leave overlapping a range, with names (who is out). */
export async function whoIsOut(from: string, to: string): Promise<NamedLeave[]> {
  const [{ data, error }, dir] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("*")
      .eq("status", "approved")
      .lte("from_day", to)
      .gte("to_day", from)
      .order("from_day"),
    loadDirectory(),
  ])
  if (error) throw fail(error, "Could not load who is out.")
  return ((data || []) as LeaveRequest[]).map((r) => named(dir, r))
}
