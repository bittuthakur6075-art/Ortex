// The payroll reports (Payroll → Reports), each a 2-D array (header row first)
// so one preview table and one CSV / xlsx export serve them all. The inputs
// are the period's PAID runs with their payslips, so a report states what was
// actually paid, never a draft.

import { registerRows, round2 } from "../../../lib/payroll"
import { dayWords, employeesFrom, flatSlip, KIND_LABEL, monthWords, RUN_STATUS } from "./shared"

const sum = (xs) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))

/** Every payslip of the period, flattened, each carrying its run's month. */
export function periodSlips(runs) {
  return runs.flatMap((run) => (run.payslips || []).map((r) => ({ ...flatSlip(r, run), runMonth: run.month, row: r })))
}

export function payrollSummary(runs) {
  const header = ["Pay run", "Type", "Status", "Pay date", "Employees", "Gross", "Deductions", "TDS", "Reimbursements", "Net pay", "Employer contributions", "Payroll cost"]
  const rows = runs.map((r) => {
    const t = r.totals || {}
    return [
      monthWords(r.month) + (r.title ? ` · ${r.title}` : ""),
      KIND_LABEL[r.kind] || r.kind,
      RUN_STATUS[r.status]?.label || r.status,
      dayWords(r.pay_date),
      t.employees || 0,
      t.gross || 0,
      t.deductions || 0,
      t.tds || 0,
      t.reimbursements || 0,
      t.netPay || 0,
      t.employer || 0,
      t.payrollCost || 0,
    ]
  })
  const col = (i) => sum(rows.map((r) => r[i]))
  const total = ["Total", "", "", "", "", col(5), col(6), col(7), col(8), col(9), col(10), col(11)]
  return [header, ...rows, ...(rows.length > 1 ? [total] : [])]
}

/** The Form IV style register across the period, a Month column first. */
export function salaryRegister(runs) {
  const slips = periodSlips(runs)
  if (!slips.length) return [["Month", "No payslips"]]
  const out = registerRows(slips, employeesFrom(slips.map((s) => s.row)))
  return [["Month", ...out[0]], ...out.slice(1).map((r, i) => [monthWords(slips[i].runMonth), ...r])]
}

export function epfSummary(runs) {
  const header = ["Month", "UAN", "Name", "Gross", "EPF wages", "EPS wages", "Employee EPF (12%)", "Employer EPS (8.33%)", "Employer EPF", "EDLI", "Admin charges"]
  const rows = periodSlips(runs)
    .filter((s) => s.status === "included" && (s.pf?.employee || 0) > 0)
    .map((s) => [
      monthWords(s.runMonth),
      s.employee?.uan || "",
      s.employee?.name || "",
      s.gross || 0,
      s.pf.base || 0,
      Math.min(s.pf.base || 0, s.pfCeiling || s.pf.base || 0),
      s.pf.employee || 0,
      s.pf.eps || 0,
      s.pf.employerEpf || 0,
      s.pf.edli || 0,
      s.pf.admin || 0,
    ])
  return withTotal(header, rows, 3)
}

export function esiSummary(runs) {
  const header = ["Month", "IP number", "Name", "Paid days", "Gross", "Employee ESI (0.75%)", "Employer ESI (3.25%)"]
  const rows = periodSlips(runs)
    .filter((s) => s.status === "included" && (s.esi?.employee || 0) + (s.esi?.employer || 0) > 0)
    .map((s) => [monthWords(s.runMonth), s.employee?.esi_ip || "", s.employee?.name || "", s.paidDays || 0, s.gross || 0, s.esi.employee || 0, s.esi.employer || 0])
  return withTotal(header, rows, 4)
}

export function lwfSummary(runs) {
  const header = ["Month", "Name", "Employee LWF", "Employer LWF"]
  const rows = periodSlips(runs)
    .filter((s) => s.status === "included" && (s.lwf?.employee || 0) + (s.lwf?.employer || 0) > 0)
    .map((s) => [monthWords(s.runMonth), s.employee?.name || "", s.lwf.employee || 0, s.lwf.employer || 0])
  return withTotal(header, rows, 2)
}

/** Per person over the period: taxable pay and TDS deducted. */
export function tdsSummary(runs) {
  const header = ["Employee code", "Name", "PAN (last 4)", "Regime", "Months", "Taxable pay", "TDS deducted", "Latest tax for the year"]
  const by = new Map()
  for (const s of periodSlips(runs).filter((x) => x.status === "included")) {
    const p = by.get(s.user_id) || { s, months: 0, taxable: 0, tds: 0 }
    p.months += 1
    p.taxable += (s.earnings || []).filter((e) => e.taxable !== false).reduce((t, e) => t + (Number(e.amount) || 0), 0)
    p.tds += Number(s.tds?.monthly) || 0
    if (s.runMonth >= p.s.runMonth) p.s = s
    by.set(s.user_id, p)
  }
  const rows = [...by.values()]
    .sort((a, b) => String(a.s.employee?.name).localeCompare(String(b.s.employee?.name)))
    .map((p) => [
      p.s.employee?.employee_code || "",
      p.s.employee?.name || "",
      p.s.employee?.pan_last4 || "",
      p.s.tds?.regime === "old" ? "Old" : "New",
      p.months,
      round2(p.taxable),
      round2(p.tds),
      p.s.tds?.annualTax || 0,
    ])
  return withTotal(header, rows, 5, [7])
}

export function loanOutstanding(loans, nameOf) {
  const header = ["Person", "Loan", "Amount", "Instalment", "Recovered", "Balance", "Recovery from", "Status"]
  const rows = loans
    .filter((l) => l.status !== "closed" && l.balance > 0)
    .map((l) => [nameOf(l.user_id), l.name, Number(l.amount), Number(l.instalment), l.recovered, l.balance, monthWords(l.start_month), l.status === "paused" ? "Paused" : "Active"])
  return withTotal(header, rows, 2, [3])
}

export function reimbursementSummary(claims, nameOf, inPeriod) {
  const header = ["Person", "Category", "Amount", "Bill date", "Status", "Description"]
  const LABEL = { pending: "Waiting", approved: "Approved", paid: "Paid", rejected: "Rejected", cancelled: "Withdrawn" }
  const rows = claims
    .filter((c) => inPeriod(c.bill_date))
    .map((c) => [nameOf(c.user_id), c.category, Number(c.amount), dayWords(c.bill_date), LABEL[c.status] || c.status, c.description || ""])
  return withTotal(header, rows, 2)
}

const ACTION = {
  "run.create": "Created the pay run",
  "run.save": "Calculated the payslips",
  "run.submit": "Submitted for approval",
  "run.approve": "Approved",
  "run.recall": "Recalled to draft",
  "run.pay": "Recorded the payment",
  "run.cancel": "Cancelled the pay run",
  "run.bank_file": "Downloaded the bank file",
  "payslip.release": "Released a withheld salary",
  "employee.save": "Changed a pay profile",
  "employee.reveal": "Viewed full PAN and bank account",
  "revision.add": "Added a salary revision",
  "revision.delete": "Deleted a salary revision",
  "claim.approve": "Approved a claim",
  "claim.reject": "Rejected a claim",
}

export function payrollHistory(entries, nameOf, runsById) {
  const header = ["When", "Who", "What", "Pay run", "Employee", "Detail"]
  const rows = entries.map((e) => {
    const run = e.run_id ? runsById.get(e.run_id) : null
    const detail = Object.entries(e.detail || {})
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ")
    return [
      new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      e.actor ? nameOf(e.actor) : "Automation",
      ACTION[e.action] || e.action,
      run ? monthWords(run.month) + (run.kind !== "regular" ? ` (${KIND_LABEL[run.kind]})` : "") : "",
      e.user_id ? nameOf(e.user_id) : "",
      detail,
    ]
  })
  return [header, ...rows]
}

/** Append a Total row summing every numeric column from `from`, except `skip`. */
function withTotal(header, rows, from, skip = []) {
  if (rows.length < 2) return [header, ...rows]
  const total = header.map((_, i) => (i === 0 ? "Total" : i >= from && !skip.includes(i) && rows.every((r) => typeof r[i] === "number") ? sum(rows.map((r) => r[i])) : ""))
  return [header, ...rows, total]
}
