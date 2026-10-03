// The bank transfer CSV an approved run hands to the bank. The shape comes
// from the engine (lib/payroll.js); this file only gathers the inputs and
// saves the result. Skipped and withheld payslips are left out.

import { bankFileRows, toCsv } from "../../../lib/payroll"
import { bankDetails } from "../../../services/payroll"
import { downloadText, employeesFrom, flatSlip } from "./shared"

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
