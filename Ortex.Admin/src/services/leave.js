// Leave data for the console (migration 0036, docs/pm/ATTENDANCE_LEAVE_PLAN.md §2.7).
//
// Nothing here writes a balance or a request row directly. Applying, deciding,
// cancelling and adjusting all go through the database functions, which count
// the days, check the balance and keep the ledger honest; the console only
// reads, and asks. Every read reports `missing: true` while 0036 is not applied,
// so a page can say so instead of throwing.

import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { isMissing } from "./attendance"

const BUCKET = "leave-documents"

function fail(error) {
  if (isMissing(error)) return { missing: true, error: null }
  return { missing: false, error: error?.message || "Something went wrong" }
}

function raise(error) {
  if (isMissing(error)) throw new Error("Leave is not set up on this database yet (migration 0036).")
  throw new Error(error.message)
}

// ---- policy ---------------------------------------------------------------------------------

export async function listLeaveTypes({ all = false } = {}) {
  if (!hasSupabase) return { rows: [], missing: true }
  let q = supabase.from("leave_types").select("*").order("sort", { ascending: true })
  if (!all) q = q.eq("active", true)
  const { data, error } = await q
  if (error) return { rows: [], ...fail(error) }
  return { rows: data || [], missing: false }
}

/** Upsert one leave type. Refused by RLS for anyone but the Super Admin. */
export async function saveLeaveType(row, { isNew = false } = {}) {
  const clean = {
    code: String(row.code || "").trim().toUpperCase(),
    name: String(row.name || "").trim(),
    annual: Number(row.annual) || 0,
    accrual: row.accrual,
    carry_max: Number(row.carry_max) || 0,
    half_day: Boolean(row.half_day),
    max_run: row.max_run === "" || row.max_run == null ? null : Number(row.max_run),
    notice_days: Number(row.notice_days) || 0,
    doc_after_days: row.doc_after_days === "" || row.doc_after_days == null ? null : Number(row.doc_after_days),
    paid: Boolean(row.paid),
    expires_days: row.expires_days === "" || row.expires_days == null ? null : Number(row.expires_days),
    active: row.active !== false,
    sort: Number(row.sort) || 0,
  }
  if (!/^[A-Z]{2,4}$/.test(clean.code)) throw new Error("A leave code is 2 to 4 capital letters, for example ML")
  if (!clean.name) throw new Error("Give the leave type a name")
  const q = isNew
    ? supabase.from("leave_types").insert(clean).select("code")
    : supabase.from("leave_types").update(clean).eq("code", clean.code).select("code")
  const { data, error } = await q
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error(`There is already a leave type ${clean.code}`)
    raise(error)
  }
  if (!data?.length) throw new Error("Only the Super Admin can change the leave policy")
}

// ---- balances and the ledger ---------------------------------------------------------------------

/** One person's balances per type (own, or anyone's with attendance-team). */
export async function leaveBalances(userId = null) {
  if (!hasSupabase) return { rows: [], missing: true }
  const { data, error } = await supabase.rpc("leave_balances", { p_user: userId })
  if (error) return { rows: [], ...fail(error) }
  return { rows: (data || []).map(numify), missing: false }
}

const numify = (r) => ({
  ...r,
  balance: Number(r.balance) || 0,
  pending: Number(r.pending) || 0,
  available: Number(r.available) || 0,
  taken_year: Number(r.taken_year) || 0,
  annual: Number(r.annual) || 0,
})

/** Balances for many people, one call each (a company of tens, not thousands). */
export async function balancesFor(userIds) {
  const out = {}
  let missing = false
  let error = null
  await Promise.all(
    userIds.map(async (id) => {
      const r = await leaveBalances(id)
      if (r.missing) missing = true
      else if (r.error) error = r.error
      out[id] = r.rows
    }),
  )
  return { byUser: out, missing, error }
}

export async function listLedger({ userId, type } = {}) {
  if (!hasSupabase) return { rows: [], missing: true }
  let q = supabase.from("leave_ledger").select("*").order("at", { ascending: false }).limit(500)
  if (userId) q = q.eq("user_id", userId)
  if (type) q = q.eq("type_code", type)
  const { data, error } = await q
  if (error) return { rows: [], ...fail(error) }
  return { rows: (data || []).map((r) => ({ ...r, delta: Number(r.delta) || 0 })), missing: false }
}

// ---- requests ------------------------------------------------------------------------------------

/** Requests, newest first. `from`/`to` keep those that overlap the range. */
export async function listLeaveRequests({ userId, status, from, to } = {}) {
  if (!hasSupabase) return { rows: [], missing: true }
  let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(1000)
  if (userId) q = q.eq("user_id", userId)
  if (status && status !== "all") q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status)
  if (from) q = q.gte("to_day", from)
  if (to) q = q.lte("from_day", to)
  const { data, error } = await q
  if (error) return { rows: [], ...fail(error) }
  return { rows: (data || []).map((r) => ({ ...r, days: Number(r.days) || 0 })), missing: false }
}

export async function applyLeave({ type, from, to, fromHalf, toHalf, reason, attachment }) {
  const { data, error } = await supabase.rpc("leave_apply", {
    p_type: type,
    p_from: from,
    p_to: to,
    p_from_half: fromHalf || "full",
    p_to_half: toHalf || "full",
    p_reason: reason,
    p_attachment: attachment || null,
  })
  if (error) raise(error)
  return data
}

export async function decideLeave(id, approve, note) {
  const { error } = await supabase.rpc("leave_decide", { p_id: id, p_approve: approve, p_note: note || null })
  if (error) raise(error)
}

export async function cancelLeave(id, note) {
  const { error } = await supabase.rpc("leave_cancel", { p_id: id, p_note: note || null })
  if (error) raise(error)
}

export async function adjustLeave(userId, type, delta, note) {
  const { error } = await supabase.rpc("leave_adjust", { p_user: userId, p_type: type, p_delta: delta, p_note: note })
  if (error) raise(error)
}

// ---- certificates -----------------------------------------------------------------------------------

/** Upload into the caller's own folder of the private bucket; returns the path. */
export async function uploadLeaveDocument(userId, file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase()
  const safeExt = ["jpg", "jpeg", "png", "pdf"].includes(ext) ? ext : file.type === "application/pdf" ? "pdf" : "jpg"
  const path = `${userId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${safeExt}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || (safeExt === "pdf" ? "application/pdf" : "image/jpeg"),
    upsert: false,
  })
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("Leave is not set up on this database yet (migration 0036).")
    throw new Error(error.message)
  }
  return path
}

export async function leaveDocumentUrl(path) {
  if (!supabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl || null
}
