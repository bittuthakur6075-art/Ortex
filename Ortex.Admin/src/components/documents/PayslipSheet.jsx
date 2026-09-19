import { forwardRef } from "react"
import { PAYSLIP_CSS, payslipBody } from "../../lib/payslipTemplate"

// The A4 payslip in Zoho Payroll's standard layout. The page is
// lib/payslipTemplate.js, generated from the phone's
// Ortex.Mobile/src/documents/payslipTemplate.ts, so the console and the phone
// print the same document; this component only feeds it.
//
// `slip` is a payslip row's `data` (the engine's computePayslip() output plus
// the employee snapshot, pay date and year-to-date taken when the run was
// calculated), so a payslip always prints as it was paid, whatever the pay
// profile says now. `org` is payroll settings' `organisation`; a person without
// payroll access cannot read those settings, so it falls back to the company.
// `payDate` covers payslips calculated before the pay date was stored on them.

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function monthLabel(month) {
  if (!month) return ""
  const [y, m] = String(month).split("-").map(Number)
  return `${LONG[m - 1]} ${y}`
}

const key = (x) => `${x.code || ""}|${x.name || ""}`

const withYtd = (xs, ytd) => (xs || []).map((x) => ({ name: x.name, amount: Number(x.amount) || 0, ytd: ytd ? (ytd[key(x)] ?? null) : null }))

const PayslipSheet = forwardRef(function PayslipSheet({ slip, org = {}, title, status, payDate, className = "" }, ref) {
  const s = slip || {}
  const html = payslipBody({
    company: {
      name: org.name || "Ortex Industries",
      address: String(org.address || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      logo: "/logo.svg",
    },
    month: monthLabel(s.month),
    title,
    withheld: status === "withheld",
    payDate: s.payDate || payDate || null,
    employee: s.employee || {},
    paidDays: s.paidDays,
    lopDays: s.lopDays,
    earnings: withYtd(s.earnings, s.ytdLines?.earnings),
    deductions: withYtd(s.deductions, s.ytdLines?.deductions),
    reimbursements: withYtd(s.reimbursements),
    gross: s.gross,
    totalDeductions: s.totalDeductions,
    reimbursementTotal: s.reimbursementTotal,
    netPay: s.netPay,
  })
  return (
    <div ref={ref} className={`print-area bg-white ${className}`} style={{ width: "794px" }}>
      <style>{PAYSLIP_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
})

export default PayslipSheet
