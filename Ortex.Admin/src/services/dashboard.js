// The Dashboard's reads outside quote-to-cash: attendance today, the decisions
// waiting (leave, corrections, pay runs), the team bot's runs and the
// latest audited changes. Quote-to-cash itself comes from useCollections.
//
// Every section is asked only when this person may see it (`access`), and each
// read is independent: one that fails or is not installed yet (an older
// migration) leaves its card out instead of blanking the page. Nothing here
// writes.

import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { repo } from "../data/store/repository"
import { getSettings, listDays, listFlagged, listHolidays, listPunches, listCorrections, lockedMonths, todayIST } from "./attendance"
import { attendanceExpectations } from "../lib/attendanceToday"
import { listLeaveRequests, listLeaveTypes } from "./leave"
import { getPayrollSettings, listRuns } from "./payroll"
import { listProfiles } from "./users"

// A read that must not take the page down with it. `null` means "not shown".
const safe = (p, pick = (x) => x) =>
  Promise.resolve(p)
    .then((r) => (r?.missing ? null : pick(r)))
    .catch(() => null)

async function recentActivity(limit) {
  const { data, error } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).map((r) => ({ id: r.id, collection: r.table_name, recordId: r.row_id, action: r.action, actor: r.actor, at: r.at, label: r.label || "" }))
}

async function botRunsToday(day) {
  const { data, error } = await supabase.from("anu_bot_runs").select("*").eq("day", day)
  if (error) throw error
  return data || []
}

/**
 * Who is expected in on `day` (attendanceExpectations), from the three reads it
 * needs. A read that fails counts as empty: no autoPresent list, no holiday,
 * nobody on leave.
 */
export async function loadExpectations(day) {
  const [settings, holidays, leave] = await Promise.all([
    getSettings().catch(() => ({})),
    listHolidays({ from: day, to: day }).catch(() => ({})),
    listLeaveRequests({ status: "approved", from: day, to: day }).catch(() => ({})),
  ])
  return attendanceExpectations(day, { settings: settings.doc || {}, holidays: holidays.rows || [], leave: leave.rows || [] })
}

/**
 * @param access {
 *   attendance: see everyone's attendance today (admin or attendance-team),
 *   people: list every profile (admins only: it carries `active`),
 *   decide: decide leave and corrections (admins),
 *   payroll: is_payroll(),
 *   bot: read the team bot's runs (admins),
 *   locks: the payroll month lock (Super Admin),
 * }
 */
export async function loadOps(access) {
  if (!hasSupabase) return { demo: true }
  const today = todayIST()
  const yesterday = todayIST(Date.now() - 86400000)
  const [names, punches, days, flagged, profiles, leave, leaveTypes, corrections, runs, payroll, bot, locks, activity, expect] = await Promise.all([
    safe(repo.staffDirectory?.(), (x) => x || {}),
    access.attendance ? safe(listPunches({ from: today, to: today }), (r) => r.rows) : null,
    access.attendance ? safe(listDays({ from: yesterday, to: today }), (r) => r.rows) : null,
    access.attendance ? safe(listFlagged(30), (r) => r.rows) : null,
    access.people ? safe(listProfiles()) : null,
    access.decide ? safe(listLeaveRequests({ status: "pending" }), (r) => r.rows) : null,
    access.decide ? safe(listLeaveTypes({ all: true }), (r) => Object.fromEntries(r.rows.map((t) => [t.code, t.name]))) : null,
    access.decide ? safe(listCorrections({ status: "pending" }), (r) => r.rows) : null,
    access.payroll ? safe(listRuns()) : null,
    access.payroll ? safe(getPayrollSettings()) : null,
    access.bot ? safe(botRunsToday(today)) : null,
    access.locks ? safe(lockedMonths(), (r) => r.rows) : null,
    safe(recentActivity(6)),
    access.attendance ? loadExpectations(today).catch(() => null) : null,
  ])
  return { today, yesterday, names: names || {}, punches, days, flagged, profiles, leave, leaveTypes: leaveTypes || {}, corrections, runs, payroll, bot, locks, activity, expect }
}
