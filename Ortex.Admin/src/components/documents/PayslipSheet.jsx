import { forwardRef } from "react"
import { formatCurrency, formatDate } from "../../lib/format"
import { rupeesInWords } from "../../lib/payroll"

// The A4 payslip: the wage slip Form V asks for, laid out the way Zoho
// Payroll's reads, on the same sheet geometry as DocumentSheet (`.doc-*` in
// index.css, in points). Masthead → employer → "Payslip for the month of" →
// the employee → days → earnings beside deductions → net pay in figures and
// words → employer contributions → footer pinned to the bottom edge.
//
// `slip` is a payslip row's `data` (the engine's computePayslip() output plus
// the employee and attendance snapshot taken when the run was calculated), so
// a payslip always prints as it was paid, whatever the pay profile says now.
// `org` is payroll settings' `organisation` (name, address, PAN, TAN, PF, ESI,
// LWF numbers); a person without payroll access cannot read those settings,
// so every field is optional and the company name falls back.

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function payslipMonthLabel(month) {
  if (!month) return ""
  const [y, m] = String(month).split("-").map(Number)
  return `${LONG[m - 1]} ${y}`
}

const days = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")
}

const last4 = (v) => (v ? `XXXX${v}` : "-")

const cellL = { textAlign: "left", padding: "3pt 0", verticalAlign: "top" }
const cellR = { textAlign: "right", padding: "3pt 0", verticalAlign: "top", whiteSpace: "nowrap" }
const headL = { ...cellL, fontWeight: 600, fontSize: "7.5pt", padding: "0 0 4pt", borderBottom: "0.75pt solid #000" }
const headR = { ...headL, textAlign: "right" }
const totalL = { ...cellL, fontWeight: 600, borderTop: "0.75pt solid #EBEBEB", paddingTop: "4pt" }
const totalR = { ...cellR, fontWeight: 600, borderTop: "0.75pt solid #EBEBEB", paddingTop: "4pt" }

function Column({ title, rows, totalLabel, total }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
      <thead>
        <tr>
          <th style={headL}>{title}</th>
          <th style={headR}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td style={cellL}>None</td>
            <td style={cellR}>-</td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={`${r.code}-${i}`}>
              <td style={cellL}>
                {r.name}
                {r.full != null && r.full !== r.amount && (
                  <span style={{ display: "block", fontSize: "7.5pt" }}>of {formatCurrency(r.full)} for the full month</span>
                )}
              </td>
              <td style={cellR}>{formatCurrency(r.amount)}</td>
            </tr>
          ))
        )}
        <tr>
          <td style={totalL}>{totalLabel}</td>
          <td style={totalR}>{formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

const PayslipSheet = forwardRef(function PayslipSheet({ slip, org = {}, title, status, className = "" }, ref) {
  const s = slip || {}
  const e = s.employee || {}
  const month = payslipMonthLabel(s.month)
  const companyName = org.name || "Ortex Industries"
  const address = String(org.address || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const ids = [
    org.pan && `PAN ${org.pan}`,
    org.tan && `TAN ${org.tan}`,
    org.pfCode && `PF ${org.pfCode}`,
    org.esiCode && `ESI ${org.esiCode}`,
    org.lwfReg && `LWF ${org.lwfReg}`,
  ].filter(Boolean)
  const earnings = s.earnings || []
  const deductions = s.deductions || []
  const reimbursements = s.reimbursements || []
  const employer = s.employer || []
  const carried = s.carried || []
  const tds = s.tds || {}

  const details = [
    ["Employee name", e.name || "-"],
    ["Employee code", e.employee_code || "-"],
    ["Designation", e.designation || "-"],
    ["Department", e.department || "-"],
    ["Date of joining", e.doj ? formatDate(e.doj) : "-"],
    ["PAN", last4(e.pan_last4)],
    ["UAN", e.uan || "-"],
    ["ESI IP number", e.esi_ip || "-"],
    ["Bank account", e.account_last4 ? `${e.bank_name ? `${e.bank_name} ` : ""}${last4(e.account_last4)}` : e.pay_mode && e.pay_mode !== "bank" ? `Paid by ${e.pay_mode}` : "-"],
    ["Tax regime", tds.regime === "old" ? "Old regime" : "New regime"],
  ]

  return (
    <div ref={ref} className={`doc-sheet print-area ${className}`}>
      <div className="doc-head">
        <div className="doc-title">Payslip</div>
        <img src="/logo.svg" alt={companyName} className="doc-logo" />
      </div>

      <div className="doc-party" style={{ marginTop: "14pt" }}>
        <div className="doc-party-name">{companyName}</div>
        {address.map((l) => (
          <div key={l}>{l}</div>
        ))}
        {ids.length > 0 && <div style={{ fontSize: "7.5pt", marginTop: "2pt" }}>{ids.join("  ·  ")}</div>}
      </div>

      <div className="doc-headline" style={{ marginTop: "18pt" }}>
        Payslip for the month of {month}
        {title ? <span style={{ fontWeight: 400 }}>{`, ${title}`}</span> : null}
      </div>
      {status === "withheld" && <div className="doc-headline-sub">This salary is withheld and has not been paid yet.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "20pt", marginTop: "12pt", fontSize: "9pt" }}>
        {details.map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: "8pt", padding: "1.5pt 0", borderBottom: "0.75pt solid #EBEBEB" }}>
            <span style={{ width: "92pt", flex: "none" }}>{k}</span>
            <span style={{ fontWeight: 500, minWidth: 0 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "24pt", marginTop: "12pt", fontSize: "9pt" }}>
        <span>
          Paid days <b style={{ fontWeight: 600 }}>{days(s.paidDays)}</b>
        </span>
        <span>
          Loss of pay days <b style={{ fontWeight: 600 }}>{days(s.lopDays)}</b>
        </span>
        <span>
          Days in the pay basis <b style={{ fontWeight: 600 }}>{days(s.basisDays)}</b>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "20pt", marginTop: "16pt" }}>
        <Column title="Earnings" rows={earnings} totalLabel="Gross earnings" total={s.gross} />
        <Column title="Deductions" rows={deductions} totalLabel="Total deductions" total={s.totalDeductions} />
      </div>

      {reimbursements.length > 0 && (
        <div style={{ marginTop: "14pt", maxWidth: "50%" }}>
          <Column title="Reimbursements (not taxed)" rows={reimbursements} totalLabel="Total reimbursements" total={s.reimbursementTotal} />
        </div>
      )}

      <div className="doc-after" style={{ marginTop: "18pt", alignItems: "flex-start" }}>
        <div className="doc-words">
          <b>Net pay in words</b>
          {rupeesInWords(s.netPay)}
        </div>
        <div className="doc-totals">
          <div className="doc-total-row">
            <span>Gross earnings</span>
            <span>{formatCurrency(s.gross)}</span>
          </div>
          {Number(s.reimbursementTotal) > 0 && (
            <div className="doc-total-row">
              <span>Reimbursements</span>
              <span>{formatCurrency(s.reimbursementTotal)}</span>
            </div>
          )}
          <div className="doc-total-row">
            <span>Less deductions</span>
            <span>{formatCurrency(s.totalDeductions)}</span>
          </div>
          <div className="doc-total-row grand" style={{ fontSize: "11pt" }}>
            <span>Net pay</span>
            <span>{formatCurrency(s.netPay)}</span>
          </div>
        </div>
      </div>

      <div className="doc-notes">
        {employer.length > 0 && (
          <>
            <h4>Employer contributions (not part of net pay)</h4>
            <p>
              {employer.map((x) => `${x.name} ${formatCurrency(x.amount)}`).join(", ")}. Cost to the company this month {formatCurrency(s.costToCompany)}.
            </p>
          </>
        )}
        {Number(tds.monthly) > 0 && (
          <>
            <h4>Income tax</h4>
            <p>
              Projected taxable salary for the year {formatCurrency(tds.taxable)}, tax for the year {formatCurrency(tds.annualTax)}. This month's TDS{" "}
              {formatCurrency(tds.monthly)}.
            </p>
          </>
        )}
        {carried.length > 0 && (
          <>
            <h4>Carried to next month</h4>
            <p>
              {carried.map((x) => `${x.name} ${formatCurrency(x.amount)}`).join(", ")}, held back so deductions stay within half of this month's pay.
            </p>
          </>
        )}
      </div>

      <div className="doc-foot">
        <span>This is a system-generated payslip.</span>
        <span>
          {companyName} · {month}
        </span>
      </div>
    </div>
  )
})

export default PayslipSheet
