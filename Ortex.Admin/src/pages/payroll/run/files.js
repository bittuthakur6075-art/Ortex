// The files a pay run produces once it is approved: the bank transfer CSV, the
// EPFO ECR, the ESIC upload, the salary register and the TDS summary. The
// shapes come from the engine (lib/payroll.js); this file only gathers the
// inputs and saves the result. Every builder skips skipped and withheld rows,
// as the engine does, except the register, which lists everyone with a status.

import { bankFileRows, ecrLines, esicRows, registerRows, toCsv } from "../../../lib/payroll"
import { bankDetails } from "../../../services/payroll"
import { downloadCsvRaw } from "../../../lib/csv"
import { downloadText, downloadXlsx, employeesFrom, flatSlip } from "./shared"

const stemOf = (run) => `${String(run.month).slice(0, 7)}${run.kind === "regular" ? "" : `-${run.kind}`}`

/** "07/10/2026", the date format bank bulk-upload templates ask for. */
const bankDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")

/** Bank transfer CSV with full account numbers (payroll_bank_details, logged). Returns warnings. */
export async function downloadBankFile(run, rows, settings) {
  const bank = await bankDetails(run.id)
  const b = settings?.bank || {}
  const employees = employeesFrom(rows, bank, b.debitIfsc || "")
  const slips = rows.map((r) => flatSlip(r, run))
  const out = bankFileRows(slips, employees, {
    debitAccount: b.debitAccount || "",
    narration: b.narration || "Salary",
    date: bankDate(run.pay_date),
    columns: b.columns,
  })
  downloadText(`bank-transfer-${stemOf(run)}.csv`, toCsv(out), "text/csv;charset=utf-8")
  const payable = slips.filter((s) => s.status === "included" && s.netPay > 0)
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  const missing = payable.filter((s) => {
    const e = byUser.get(s.user_id) || {}
    return (e.pay_mode || "bank") === "bank" && (!e.account_number || !e.ifsc)
  })
  return missing.map((s) => `${s.employee?.name || "Someone"} has no bank account or IFSC`)
}

/** EPFO ECR v2 text file. Returns warnings (members without a UAN). */
export function downloadEcr(run, rows) {
  const slips = rows.map((r) => flatSlip(r, run))
  const employees = employeesFrom(rows)
  const lines = ecrLines(slips, employees)
  downloadText(`ecr-${stemOf(run)}.txt`, lines.join("\r\n"))
  return slips
    .filter((s) => s.status === "included" && (s.pf?.employee || 0) > 0 && !s.employee?.uan)
    .map((s) => `${s.employee?.name || "Someone"} has PF deducted but no UAN`)
}

/** ESIC monthly upload: every cell text, as the portal wants. CSV when xlsx cannot load. */
export async function downloadEsic(run, rows) {
  const out = esicRows(rows.map((r) => flatSlip(r, run)), employeesFrom(rows))
  const ok = await downloadXlsx(`esic-${stemOf(run)}.xlsx`, [{ name: "ESIC", rows: out }], { asText: true })
  if (!ok) downloadCsvRaw(`esic-${stemOf(run)}.csv`, out)
  return out.length - 1
}

/** Salary register (Form IV style) as xlsx, or CSV with `csv`. */
export async function downloadRegister(run, rows, { csv = false } = {}) {
  const out = registerRows(rows.map((r) => flatSlip(r, run)), employeesFrom(rows))
  if (csv || !(await downloadXlsx(`salary-register-${stemOf(run)}.xlsx`, [{ name: "Register", rows: out }]))) {
    downloadCsvRaw(`salary-register-${stemOf(run)}.csv`, out)
  }
}

/** One row per person: the month's TDS and the projection behind it. */
export function tdsRows(slips) {
  const header = ["Employee code", "Name", "PAN (last 4)", "Regime", "Taxable this month", "Projected annual gross", "Taxable after deductions", "Tax for the year", "TDS this month"]
  const rows = slips
    .filter((s) => s.status === "included")
    .map((s) => {
      const taxable = (s.earnings || []).filter((e) => e.taxable !== false).reduce((t, e) => t + (Number(e.amount) || 0), 0)
      return [
        s.employee?.employee_code || "",
        s.employee?.name || "",
        s.employee?.pan_last4 || "",
        s.tds?.regime === "old" ? "Old" : "New",
        taxable,
        s.tds?.annualGross || 0,
        s.tds?.taxable || 0,
        s.tds?.annualTax || 0,
        s.tds?.monthly || 0,
      ]
    })
  return [header, ...rows]
}

export function downloadTdsSummary(run, rows) {
  downloadCsvRaw(`tds-summary-${stemOf(run)}.csv`, tdsRows(rows.map((r) => flatSlip(r, run))))
}
