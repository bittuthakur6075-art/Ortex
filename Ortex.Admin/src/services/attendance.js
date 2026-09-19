// Attendance data for the console (migration 0033, docs/pm/ATTENDANCE_LEAVE_PLAN.md).
//
// The console READS attendance and manages its settings; it never creates a
// punch. Punches are written only by the phone through attendance_punch(), so
// nothing here inserts into attendance_punches. Review goes through the
// attendance_review() function, which refuses anyone who is not an admin and
// anyone reviewing their own punch.
//
// Every read reports `missing: true` when the tables do not exist yet (0033
// not pushed), so a page can say so instead of throwing.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const BUCKET = "attendance-selfies"
const PAGE = 1000

/** 0033 not applied: the relation (or the function) is not there. */
export function isMissing(error) {
  if (!error) return false
  const code = String(error.code || "")
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    code === "42883" ||
    /does not exist|could not find the (table|function)/i.test(String(error.message || ""))
  )
}

function fail(error) {
  if (isMissing(error)) return { missing: true, error: null }
  return { missing: false, error: error?.message || "Something went wrong" }
}

/** Punches with `day` between from and to (YYYY-MM-DD, inclusive), newest first. */
export async function listPunches({ from, to, userId } = {}) {
  if (!hasSupabase) return { rows: [], missing: true }
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from("attendance_punches").select("*").order("at", { ascending: false }).range(offset, offset + PAGE - 1)
    if (from) q = q.gte("day", from)
    if (to) q = q.lte("day", to)
    if (userId) q = q.eq("user_id", userId)
    const { data, error } = await q
    if (error) return { rows: [], ...fail(error) }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return { rows, missing: false }
}

/** Flagged punches still waiting for a decision, from the last `days` days. */
export async function listFlagged(days = 30) {
  if (!hasSupabase) return { rows: [], missing: true }
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase
    .from("attendance_punches")
    .select("*")
    .eq("review", "flagged")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(500)
  if (error) return { rows: [], ...fail(error) }
  return { rows: data || [], missing: false }
}

/** Short-lived view URL for a selfie, or null when it is gone (purged). */
export async function selfieUrl(path) {
  if (!supabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl || null
}

export async function reviewPunch(id, decision, note) {
  const { error } = await supabase.rpc("attendance_review", { p_id: id, p_decision: decision, p_note: note || null })
  if (error) throw new Error(error.message)
}

// ---- settings (Super Admin) ------------------------------------------------------

export async function getSettings() {
  if (!hasSupabase) return { doc: null, missing: true }
  const { data, error } = await supabase.from("attendance_settings").select("doc, updated_at").eq("id", true).maybeSingle()
  if (error) return { doc: null, ...fail(error) }
  return { doc: data?.doc || {}, updatedAt: data?.updated_at || null, missing: false }
}

/** Merge `patch` over the stored doc. Refused by RLS for anyone but the Super Admin. */
export async function saveSettings(patch) {
  const { data: cur, error: readErr } = await supabase.from("attendance_settings").select("doc").eq("id", true).maybeSingle()
  if (readErr) throw new Error(readErr.message)
  const doc = { ...(cur?.doc || {}), ...patch }
  const { data, error } = await supabase.from("attendance_settings").update({ doc }).eq("id", true).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("Only the Super Admin can change attendance settings")
  return doc
}

// ---- office locations --------------------------------------------------------------

export async function listSites() {
  if (!hasSupabase) return { rows: [], missing: true }
  const { data, error } = await supabase.from("work_sites").select("*").order("name")
  if (error) return { rows: [], ...fail(error) }
  return { rows: data || [], missing: false }
}

export async function saveSite(site) {
  const row = {
    name: String(site.name || "").trim(),
    address: String(site.address || "").trim() || null,
    lat: Number(site.lat),
    lng: Number(site.lng),
    radius_m: Math.round(Number(site.radius_m) || 150),
    active: site.active !== false,
  }
  const q = site.id
    ? supabase.from("work_sites").update(row).eq("id", site.id).select("id")
    : supabase.from("work_sites").insert(row).select("id")
  const { data, error } = await q
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("Only the Super Admin can change office locations")
}

export async function deleteSite(id) {
  const { data, error } = await supabase.from("work_sites").delete().eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("Only the Super Admin can remove an office location")
}

// ---- per-person mode ------------------------------------------------------------------

export async function listPeopleModes() {
  if (!hasSupabase) return { byUser: {}, missing: true }
  const { data, error } = await supabase.from("attendance_people").select("*")
  if (error) return { byUser: {}, ...fail(error) }
  const byUser = {}
  for (const r of data || []) byUser[r.user_id] = r
  return { byUser, missing: false }
}

/** mode null and no site list = back to the role's default, which is no row at all. */
export async function savePersonMode(userId, { mode, site_ids }) {
  const sites = Array.isArray(site_ids) && site_ids.length ? site_ids : null
  if (!mode && !sites) {
    const { error } = await supabase.from("attendance_people").delete().eq("user_id", userId)
    if (error) throw new Error(error.message)
    return
  }
  const { data, error } = await supabase
    .from("attendance_people")
    .upsert({ user_id: userId, mode: mode || null, site_ids: sites, updated_at: new Date().toISOString() })
    .select("user_id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("Only the Super Admin can change how someone clocks in")
}

/** The role's default mode, mirroring attendance_locate() in 0033. */
export const defaultModeFor = (role) => (role === "sales" ? "field" : "office")

/** Today in IST as YYYY-MM-DD. */
export function todayIST(now = Date.now()) {
  return new Date(now + 330 * 60000).toISOString().slice(0, 10)
}
