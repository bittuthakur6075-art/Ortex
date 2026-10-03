// Payroll data (migration 0040, simplified by 0077; docs/pm/PAYROLL_PLAN.md).
// Every read and write the console makes for payroll goes through here; the
// figures come from the pure engine in lib/payroll.js. The database decides who
// may do what (is_payroll(): the Super Admin and whoever holds the payroll
// grant), so a refused call surfaces its message rather than being hidden.

import { supabase } from "../data/store/supabaseClient"
import {
  computePayslip,
  dayRateOf,
  daysInMonth,
  daysWorkedFrom,
  DEFAULT_PAYROLL_SETTINGS,
  fyOf,
  monthKey,
  overtimeItem,
  overtimeMinutes,
  paidDaysFor,
  payableFrom,
  payTermsOf,
  revisionRow,
  runTotals,
  shiftMinutes,
  ytdLines,
} from "../lib/payroll"

const MISSING = /does not exist|schema cache|relation .* does not exist|Could not find the (function|table)/i
export const NOT_SET_UP = "Payroll is not set up on this database yet (migration 0040)."

function fail(error) {
  if (!error) return
  if (MISSING.test(error.message || "")) {
    const e = new Error(NOT_SET_UP)
    e.missing = true
    throw e
  }
  throw new Error(error.message || "Something went wrong")
}

async function all(query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    fail(error)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const deepMerge = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b === undefined ? a : b
  const out = { ...(a || {}) }
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v)
  return out
}

// ---- settings --------------------------------------------------------------------------------------

export async function getPayrollSettings() {
  const { data, error } = await supabase.from("payroll_settings").select("doc, updated_at").eq("id", true).maybeSingle()
  fail(error)
  return deepMerge(DEFAULT_PAYROLL_SETTINGS, data?.doc || {})
}

/** Super Admin. Merges into the stored doc. */
export async function savePayrollSettings(patch) {
  const current = await getPayrollSettings()
  const doc = deepMerge(current, patch)
  const { data, error } = await supabase.from("payroll_settings").update({ doc }).eq("id", true).select("id")
  fail(error)
  if (!data?.length) throw new Error("Only the Super Admin can change payroll settings.")
  return doc
}

// ---- people -------------------------------------------------------------------------------------------

/** Every active profile with its pay profile (or none yet) and its revisions, newest first. */
export async function listEmployees() {
  const [profiles, employees, revisions] = await Promise.all([
    all(() => supabase.from("profiles").select("id, name, email, role, active, avatar_url, created_at").order("name")),
    all(() => supabase.from("employees").select("*")),
    all(() => supabase.from("salary_revisions").select("*").order("effective_from", { ascending: false })),
  ])
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  const revs = new Map()
  for (const r of revisions) {
    if (!revs.has(r.user_id)) revs.set(r.user_id, [])
    revs.get(r.user_id).push(r)
  }
  return profiles.map((p) => ({
    ...p,
    user_id: p.id,
    employee: byUser.get(p.id) || null,
    revisions: revs.get(p.id) || [],
  }))
}

export async function getEmployee(userId) {
  const list = await listEmployees()
  return list.find((e) => e.user_id === userId) || null
}

/** Plain fields plus, optionally, `account_number` (encrypted by the database). */
export async function saveEmployee(userId, fields) {
  const { error } = await supabase.rpc("payroll_employee_save", { p_user: userId, p: fields })
  fail(error)
}

/** The full account number. Every call is written to the payroll history. */
export async function revealSecrets(userId) {
  const { data, error } = await supabase.rpc("payroll_employee_secrets", { p_user: userId })
  fail(error)
  return (data || [])[0] || { account_number: null }
}

/** The revision in force for a month: the latest effective on or before it. */
export function revisionFor(revisions, month) {
  const m = monthKey(month)
  return (revisions || []).filter((r) => r.effective_from <= m).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null
}

/** Add a revision: a pay type ("monthly" | "daily"), its rate, and the month it takes effect. */
export async function addRevision({ userId, type, rate, effectiveFrom, reason }) {
  const { error } = await supabase.from("salary_revisions").insert({
    user_id: userId,
    ...revisionRow({ type, rate }),
    effective_from: monthKey(effectiveFrom),
    payout_month: monthKey(effectiveFrom),
    reason: reason || null,
  })
  fail(error)
}

export async function deleteRevision(id) {
  const { error } = await supabase.from("salary_revisions").delete().eq("id", id)
  fail(error)
}

// ---- advances (the loans table) -------------------------------------------------------------------

export async function listLoans() {
  const [loans, recoveries] = await Promise.all([
    all(() => supabase.from("loans").select("*").order("created_at", { ascending: false })),
    all(() => supabase.from("loan_recoveries").select("*")),
  ])
  return loans.map((l) => {
    const rec = recoveries.filter((r) => r.loan_id === l.id)
    const recovered = rec.reduce((s, r) => s + Number(r.amount), 0)
    return { ...l, recoveries: rec, recovered, balance: Math.max(0, Number(l.amount) - recovered) }
  })
}

export async function saveLoan(loan) {
  const { error } = await supabase.from("loans").upsert(loan)
  fail(error)
}

export async function recordLoanRepayment(loanId, amount, note) {
  const { error } = await supabase.from("loan_recoveries").insert({ loan_id: loanId, amount, note: note || "Manual repayment" })
  fail(error)
}

// ---- pay runs -----------------------------------------------------------------------------------------------

export async function listRuns() {
  const { data, error } = await supabase.from("pay_runs").select("*").order("month", { ascending: false }).order("created_at", { ascending: false })
  fail(error)
  return data || []
}

export async function getRun(id) {
  const [{ data: run, error }, slips] = await Promise.all([
    supabase.from("pay_runs").select("*").eq("id", id).maybeSingle(),
    all(() => supabase.from("payslips").select("*").eq("run_id", id)),
  ])
  fail(error)
  return run ? { ...run, payslips: slips } : null
}

export async function createRun(month, kind = "regular", title = null) {
  const { data, error } = await supabase.rpc("payroll_run_create", { p_month: monthKey(month), p_kind: kind, p_title: title })
  fail(error)
  return data
}

/** submit · approve · recall · pay · cancel */
export async function transitionRun(id, action, { note, payDate, mode, ref } = {}) {
  const { error } = await supabase.rpc("payroll_run_transition", {
    p_run: id,
    p_action: action,
    p_note: note || null,
    p_pay_date: payDate || null,
    p_mode: mode || null,
    p_ref: ref || null,
  })
  fail(error)
}

export async function releaseWithheld(slipId) {
  const { error } = await supabase.rpc("payroll_release_withheld", { p_slip: slipId })
  fail(error)
}

export async function bankDetails(runId) {
  const { data, error } = await supabase.rpc("payroll_bank_details", { p_run: runId })
  fail(error)
  return data || []
}

/** Paid payslips of the financial year before `month`, for each line's year to date. */
export async function paidSlipsBefore(month) {
  const m = monthKey(month)
  const fy = fyOf(m)
  const runs = (await listRuns()).filter((r) => r.status === "paid" && r.month >= fy.start && r.month < m)
  if (!runs.length) return []
  const slips = await all(() => supabase.from("payslips").select("run_id, user_id, status, data").in("run_id", runs.map((r) => r.id)))
  return slips.map((s) => ({ ...s, month: runs.find((r) => r.id === s.run_id)?.month }))
}

/** Per-person payable days for the month (attendance_month_summary, 0034). */
export async function attendanceFor(month) {
  const { data, error } = await supabase.rpc("attendance_month_summary", { p_month: monthKey(month) })
  if (error) return { rows: [], error: error.message }
  return { rows: data || [], error: null }
}

/** Per-person days worked (P, OD, HD) for daily wages (payroll_days_worked, 0077). Throws when it cannot be read. */
async function daysWorkedRows(month) {
  const { data, error } = await supabase.rpc("payroll_days_worked", { p_month: monthKey(month) })
  if (error) {
    throw new Error(
      `Days worked for ${monthKey(month).slice(0, 7)} could not be read, so nothing was calculated: ${MISSING.test(error.message || "") ? "the database needs migration 0077" : error.message}`,
    )
  }
  const byUser = new Map()
  for (const r of data || []) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id).push({ day: String(r.day).slice(0, 10), status: r.status })
  }
  return byUser
}

/**
 * The month's attendance_overtime rows per person (0056, readable by payroll
 * since 0065) and the full-day shift's minutes. When they cannot be read, a
 * run with "Pay overtime automatically" on is refused (it must not silently
 * drop overtime); with it off, the hours are just not shown.
 */
async function overtimeFor(month, required) {
  const from = monthKey(month)
  const to = `${from.slice(0, 8)}${String(daysInMonth(month)).padStart(2, "0")}`
  const refuse = (why) => {
    if (!required) return { byUser: new Map(), shiftMin: 540, error: why }
    throw new Error(
      `Overtime for ${from.slice(0, 7)} could not be read, so nothing was calculated: ${why}. To calculate without overtime, turn off "Pay overtime automatically" in the payroll settings.`,
    )
  }
  let rows = []
  try {
    rows = await all(() => supabase.from("attendance_overtime").select("user_id, day, minutes").gte("day", from).lte("day", to).order("day").order("user_id"))
  } catch (e) {
    return refuse(e.missing ? "the overtime table is not on this database (migration 0056)" : e.message)
  }
  const { data: att, error } = await supabase.from("attendance_settings").select("doc").eq("id", true).maybeSingle()
  if (error) return refuse(error.message)
  const byUser = new Map()
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id).push({ day: String(r.day).slice(0, 10), minutes: Number(r.minutes) || 0 })
  }
  return { byUser, shiftMin: shiftMinutes(att?.doc?.shift), error: null }
}

/**
 * Compute a draft run's payslips: the pay type and rate in force, paid days
 * (monthly) or days worked (daily) from attendance, overtime, one-time items,
 * advance recovery, and each line's year to date.
 *
 * `edits` is { [user_id]: { status, paidDays, daysWorked, oneTime, overtime:
 * { mode, amount }, recover: { [loanId]: amount } } }, what payroll changed on
 * the run screen. They win over attendance and are kept on the slip, so they
 * survive the next Calculate.
 */
export async function computeRun(run, { edits = {} } = {}) {
  const month = run.month
  const [settings, people, att, loans, prior] = await Promise.all([getPayrollSettings(), listEmployees(), attendanceFor(month), listLoans(), paidSlipsBefore(month)])
  const existing = new Map((run.payslips || []).map((p) => [p.user_id, p]))
  // An off-cycle run (a bonus, an incentive, a settlement top-up) pays only the
  // one-time items payroll adds to it: no salary, overtime or advance recovery.
  const offCycle = run.kind && run.kind !== "regular"
  const monthEnd = `${month.slice(0, 8)}${String(daysInMonth(month)).padStart(2, "0")}`
  // A regular run refuses when attendance could not be read (it would pay
  // everyone the full month). An off-cycle run does not need attendance.
  const payableOf = payableFrom(offCycle ? { rows: att.rows } : att, month)
  const autoOvertime = settings.schedule?.payOvertime !== false

  const payees = people.filter((person) => {
    const e = person.employee
    return e && person.active && e.status !== "settled" && !(e.exit_date && e.exit_date < month) && !(e.doj && e.doj > monthEnd) && revisionFor(person.revisions, month)
  })
  const anyDaily = !offCycle && payees.some((p) => payTermsOf(revisionFor(p.revisions, month))?.type === "daily")
  const [worked, ot] = await Promise.all([anyDaily ? daysWorkedRows(month) : new Map(), offCycle ? null : overtimeFor(month, autoOvertime)])

  const slips = []
  for (const person of payees) {
    const e = person.employee
    const rev = revisionFor(person.revisions, month)
    const terms = payTermsOf(rev)
    const span = { month, doj: e.doj, exitDate: e.exit_date }
    const prev = existing.get(person.user_id)?.data || {}
    const edit = edits[person.user_id] || {}
    const pay = payableOf(person.user_id)
    const pd = paidDaysFor({ month, payable: pay.payable, doj: e.doj, exitDate: e.exit_date, basis: settings.schedule.basis, fixedDays: settings.schedule.fixedDays })

    // What payroll set on the run screen, kept across Calculate.
    const input = {
      paidDaysOverride: edit.paidDays ?? prev.paidDaysOverride ?? null,
      daysWorkedOverride: edit.daysWorked ?? prev.daysWorkedOverride ?? null,
      oneTimeInput: edit.oneTime ?? prev.oneTimeInput ?? [],
      overtimeInput: edit.overtime ?? prev.overtimeInput ?? null,
      recoverInput: { ...(prev.recoverInput || {}), ...(edit.recover || {}) },
    }
    const oneTime = [...input.oneTimeInput]
    const daysWorked = input.daysWorkedOverride ?? daysWorkedFrom(worked.get(person.user_id), span)

    let overtime = null
    if (!offCycle) {
      const minutes = overtimeMinutes(ot?.byUser.get(person.user_id), span)
      const mode = input.overtimeInput?.mode || (autoOvertime ? "auto" : "manual")
      const item = overtimeItem({
        minutes,
        mode,
        amount: input.overtimeInput?.amount ?? 0,
        dayRate: dayRateOf(terms, pd.basisDays),
        shiftMin: ot?.shiftMin,
        oneTime,
      })
      if (item) oneTime.push(item)
      overtime = { minutes, mode, amount: item?.amount || 0, hourlyRate: item?.data?.hourlyRate ?? null, error: ot?.error || null }
    }

    const slip = computePayslip({
      month,
      terms: offCycle ? null : terms,
      paidDays: input.paidDaysOverride ?? pd.paidDays,
      basisDays: pd.basisDays,
      daysWorked,
      oneTime,
      loans: offCycle ? [] : loans.filter((l) => l.user_id === person.user_id && l.status === "active" && l.start_month <= month && l.balance > 0),
      recover: input.recoverInput,
    })
    const mine = prior.filter((s) => s.user_id === person.user_id && s.data && s.status === "included")

    slips.push({
      user_id: person.user_id,
      // Nobody is paid by an off-cycle run until payroll gives them an item.
      status: edit.status ?? existing.get(person.user_id)?.status ?? (offCycle && !oneTime.length ? "skipped" : "included"),
      data: {
        ...slip,
        payDate: run.pay_date || null,
        ytdLines: ytdLines(
          mine.map((s) => s.data),
          slip,
        ),
        ...input,
        overtime,
        attendance: att.rows.find((r) => r.user_id === person.user_id) || null,
        attendanceError: att.error,
        // No summary row for a monthly person: paid the full month, flagged on the run screen.
        attendanceMissing: !offCycle && terms?.type === "monthly" && pay.missing,
        employee: {
          name: person.name || person.email,
          email: person.email,
          employee_code: e.employee_code,
          designation: e.designation,
          department: e.department,
          doj: e.doj,
          bank_name: e.bank_name,
          account_last4: e.account_last4,
          ifsc: e.ifsc,
          pay_mode: e.pay_mode,
        },
        revision: { id: rev.id, effective_from: rev.effective_from },
      },
      gross: slip.gross,
      net_pay: slip.netPay,
    })
  }
  return { slips, totals: runTotals(slips.map((s) => ({ ...s.data, status: s.status }))), attendanceError: att.error }
}

export async function saveRun(runId, slips, totals) {
  const { error } = await supabase.rpc("payroll_run_save", { p_run: runId, p_slips: slips, p_totals: totals })
  fail(error)
}

export async function history({ limit = 200 } = {}) {
  const { data, error } = await supabase.from("payroll_audit").select("*").order("at", { ascending: false }).limit(limit)
  fail(error)
  return data || []
}

// ---- self service ---------------------------------------------------------------------------------------------

/** The signed-in person's released payslips (RLS returns only theirs). */
export async function myPayslips(userId) {
  const slips = await all(() =>
    supabase.from("payslips").select("id, run_id, status, data, gross, net_pay, released_at").eq("user_id", userId).not("released_at", "is", null),
  )
  return slips.sort((a, b) => (a.data?.month < b.data?.month ? 1 : -1))
}
