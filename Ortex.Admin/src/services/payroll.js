// Payroll data (migration 0040, docs/pm/PAYROLL_PLAN.md). Every read and write
// the console makes for payroll goes through here; the figures come from the
// pure engine in lib/payroll.js. The database decides who may do what
// (is_payroll(): the Super Admin and whoever holds the payroll grant), so a
// refused call surfaces its message rather than being hidden.

import { supabase } from "../data/store/supabaseClient"
import {
  arrearsFor,
  computePayslip,
  daysInMonth,
  DEFAULT_PAYROLL_SETTINGS,
  fyOf,
  monthKey,
  paidDaysFor,
  runTotals,
  structureFromCtc,
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

// ---- settings, components, templates ----------------------------------------------------------------

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

export async function listComponents() {
  const { data, error } = await supabase.from("salary_components").select("*").order("sort")
  fail(error)
  return data || []
}

export async function saveComponent(c) {
  const { error } = await supabase.from("salary_components").upsert(c)
  fail(error)
}

export async function listTemplates() {
  const { data, error } = await supabase.from("salary_templates").select("*").order("name")
  fail(error)
  return data || []
}

export async function saveTemplate(t) {
  const { error } = await supabase.from("salary_templates").upsert(t)
  fail(error)
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from("salary_templates").delete().eq("id", id)
  fail(error)
}

// ---- people -------------------------------------------------------------------------------------------

/** Every active profile with its pay profile (or none yet) and latest revision. */
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

/** Plain fields plus, optionally, `pan` / `account_number` (encrypted by the database). */
export async function saveEmployee(userId, fields) {
  const { error } = await supabase.rpc("payroll_employee_save", { p_user: userId, p: fields })
  fail(error)
}

/** Full PAN and account number. Every call is written to the payroll history. */
export async function revealSecrets(userId) {
  const { data, error } = await supabase.rpc("payroll_employee_secrets", { p_user: userId })
  fail(error)
  return (data || [])[0] || { pan: null, account_number: null }
}

/** The revision in force for a month: the latest effective on or before it. */
export function revisionFor(revisions, month) {
  const m = monthKey(month)
  return (revisions || []).filter((r) => r.effective_from <= m).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null
}

/** Add a revision; the earnings are computed from the CTC and the template now, and kept. */
export async function addRevision({ userId, annualCtc, templateItems, templateId, effectiveFrom, payoutMonth, reason, settings, pfEnabled }) {
  const s = structureFromCtc({ annualCtc, template: templateItems, month: effectiveFrom, settings, pfEnabled })
  const { error } = await supabase.from("salary_revisions").insert({
    user_id: userId,
    annual_ctc: annualCtc,
    template_id: templateId || null,
    effective_from: monthKey(effectiveFrom),
    payout_month: monthKey(payoutMonth || effectiveFrom),
    earnings: s.earnings,
    monthly_gross: s.gross,
    employer_pf_in_ctc: s.employerPfInCtc,
    reason: reason || null,
  })
  fail(error)
  return s
}

export async function deleteRevision(id) {
  const { error } = await supabase.from("salary_revisions").delete().eq("id", id)
  fail(error)
}

// ---- loans and claims ------------------------------------------------------------------------------------

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

export async function listClaims({ status } = {}) {
  const rows = await all(() => {
    let q = supabase.from("reimbursement_claims").select("*").order("created_at", { ascending: false })
    if (status) q = q.eq("status", status)
    return q
  })
  return rows
}

export async function decideClaim(id, approve, note) {
  const { error } = await supabase.rpc("claim_decide", { p_id: id, p_approve: approve, p_note: note || null })
  fail(error)
}

export async function receiptUrl(path) {
  if (!path) return null
  const { data } = await supabase.storage.from("claim-receipts").createSignedUrl(path, 3600)
  return data?.signedUrl || null
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

/** Paid payslips of the financial year before `month`, for TDS year-to-date and arrears. */
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

/**
 * Compute a draft run's payslips from the engine: revision in force, paid days
 * from attendance (or the edits already made in the run), one-time items and
 * statuses kept from the current draft, approved claims, active loans,
 * back-dated revisions' arrears, and the year so far for TDS.
 *
 * `edits` is { [user_id]: { status, paidDays, oneTime: [...] } }, what the
 * payroll user changed in the run screen; they win over attendance.
 */
export async function computeRun(run, { edits = {} } = {}) {
  const month = run.month
  const [settings, people, att, loans, claims, prior] = await Promise.all([
    getPayrollSettings(),
    listEmployees(),
    attendanceFor(month),
    listLoans(),
    listClaims({ status: "approved" }),
    paidSlipsBefore(month),
  ])
  const payable = new Map(att.rows.map((r) => [r.user_id, Number(r.payable)]))
  const existing = new Map((run.payslips || []).map((p) => [p.user_id, p]))
  // An off-cycle run (a bonus, an incentive, a settlement top-up) pays only the
  // one-time items payroll adds to it: no monthly salary, loans, claims or
  // arrears, which belong to the regular run. TDS and LWF are left to the
  // regular run too; its projection counts this payout as paid so far and
  // catches the tax up.
  const offCycle = run.kind && run.kind !== "regular"
  const monthEnd = `${month.slice(0, 8)}${String(daysInMonth(month)).padStart(2, "0")}`

  const slips = []
  for (const person of people) {
    const e = person.employee
    if (!e || !person.active) continue
    if (e.status === "settled") continue
    if (e.exit_date && e.exit_date < month) continue
    if (e.doj && e.doj > monthEnd) continue
    const rev = revisionFor(person.revisions, month)
    if (!rev) continue

    const prev = existing.get(person.user_id)
    const edit = edits[person.user_id] || {}
    const pd = paidDaysFor({
      month,
      payable: payable.has(person.user_id) ? payable.get(person.user_id) : daysInMonth(month),
      doj: e.doj,
      exitDate: e.exit_date,
      basis: settings.schedule.basis,
      fixedDays: settings.schedule.fixedDays,
    })
    const paidDays = edit.paidDays ?? prev?.data?.paidDaysOverride ?? pd.paidDays

    // Arrears for a revision effective earlier and paid out this month.
    const oneTime = [...(edit.oneTime ?? prev?.data?.oneTimeInput ?? [])]
    const mine = prior.filter((s) => s.user_id === person.user_id && s.data)
    const arrearsRev = person.revisions.find((r) => r.payout_month === month && r.effective_from < month && !r.arrears_paid)
    if (!offCycle && arrearsRev && !oneTime.some((o) => o.code === "ARREARS")) {
      const a = arrearsFor({
        effectiveFrom: arrearsRev.effective_from,
        payoutMonth: month,
        newGross: Number(arrearsRev.monthly_gross),
        paidSlips: mine.map((s) => ({ month: s.month, status: s.status, ...s.data })),
      })
      if (a.total > 0) oneTime.push({ kind: "earning", code: "ARREARS", name: "Arrears", amount: a.total, taxable: true, lines: a.lines })
    }

    // The financial year so far, from payslips actually paid: taxable earnings
    // and the TDS already deducted (what the projection subtracts).
    const ytd = mine
      .filter((s) => s.status === "included")
      .reduce(
        (acc, s) => ({
          taxable:
            acc.taxable +
            (s.data.earnings || []).filter((x) => x.taxable !== false).reduce((t, x) => t + (Number(x.amount) || 0), 0),
          tds: acc.tds + (Number(s.data.tds?.monthly) || 0),
        }),
        { taxable: 0, tds: 0 },
      )

    const slip = computePayslip({
      month,
      structure: { earnings: offCycle ? [] : rev.earnings },
      paidDays,
      basisDays: pd.basisDays,
      oneTime,
      reimbursements: offCycle ? [] : claims.filter((c) => c.user_id === person.user_id).map((c) => ({ id: c.id, name: `Reimbursement: ${c.category}`, amount: Number(c.amount) })),
      loans: offCycle ? [] : loans.filter((l) => l.user_id === person.user_id && l.status === "active" && l.start_month <= month && l.balance > 0),
      employee: { pf: e.pf_enabled, esi: e.esi_enabled, lwf: offCycle ? false : e.lwf_enabled, tds: offCycle ? false : e.tds_enabled, regime: e.tax_regime },
      settings,
      ytd,
      taxDeductions: e.tax_regime === "old" ? Number(e.tax_deductions) || 0 : 0,
    })

    slips.push({
      user_id: person.user_id,
      // Nobody is paid by an off-cycle run until payroll gives them an item.
      status: edit.status ?? prev?.status ?? (offCycle && !oneTime.length ? "skipped" : "included"),
      data: {
        ...slip,
        // Zoho prints the pay date, and each line's year to date beside it.
        payDate: run.pay_date || null,
        ytdLines: ytdLines(
          mine.filter((s) => s.status === "included").map((s) => s.data),
          slip,
        ),
        oneTimeInput: edit.oneTime ?? prev?.data?.oneTimeInput ?? [],
        paidDaysOverride: edit.paidDays ?? prev?.data?.paidDaysOverride ?? null,
        attendance: att.rows.find((r) => r.user_id === person.user_id) || null,
        attendanceError: att.error,
        employee: {
          name: person.name || person.email,
          email: person.email,
          employee_code: e.employee_code,
          designation: e.designation,
          department: e.department,
          doj: e.doj,
          pan_last4: e.pan_last4,
          uan: e.uan,
          esi_ip: e.esi_ip,
          bank_name: e.bank_name,
          account_last4: e.account_last4,
          ifsc: e.ifsc,
          pay_mode: e.pay_mode,
        },
        revision: { id: rev.id, annual_ctc: Number(rev.annual_ctc), effective_from: rev.effective_from },
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
