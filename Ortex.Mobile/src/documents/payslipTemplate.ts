// The payslip, laid out as Zoho Payroll's standard template: company head with
// "Payslip For the Month" on the right, an employee summary beside a net-pay
// card (paid days, LOP days), the employee's statutory numbers, earnings and
// deductions side by side with Amount and YTD columns, reimbursements, a TOTAL
// NET PAYABLE band, the amount in words and the system-generated line.
//
// MIRRORED line for line by Ortex.Admin/src/lib/payslipTemplate.js (generated
// with tsc, checked by test/payslipTemplate.test.mjs): edit this file and
// regenerate. It imports nothing, so both clients print the same page: the
// phone through expo-print (documents/payslipHtml.ts), the console through
// html2pdf (components/documents/PayslipSheet.jsx).

export type TemplateLine = { name: string; amount: number; ytd?: number | null }

export type PayslipTemplateInput = {
  company: { name: string; address: string[]; logo?: string | null }
  month: string // "September 2026"
  title?: string | null // an off-cycle run's name
  withheld?: boolean
  payDate?: string | null // YYYY-MM-DD
  employee: {
    name?: string | null
    employee_code?: string | null
    designation?: string | null
    department?: string | null
    doj?: string | null
    pan_last4?: string | null
    uan?: string | null
    esi_ip?: string | null
    bank_name?: string | null
    account_last4?: string | null
    pay_mode?: string | null
  }
  paidDays: number
  lopDays: number
  earnings: TemplateLine[]
  deductions: TemplateLine[]
  reimbursements: TemplateLine[]
  gross: number
  totalDeductions: number
  reimbursementTotal: number
  netPay: number
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** ₹17,556.00, Indian grouping written by hand (no Intl, it varies on Hermes). */
export function inr(value: number): string {
  const n = Math.round((Number(value) || 0) * 100) / 100
  const neg = n < 0
  const [whole, paise] = Math.abs(n).toFixed(2).split(".")
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3
  return `${neg ? "-" : ""}₹${grouped}.${paise}`
}

/** 05/10/2026 from 2026-10-05 (Zoho prints dd/MM/yyyy). */
export function slipDate(iso?: string | null): string {
  if (!iso) return "-"
  const [y, m, d] = String(iso).slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : "-"
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ")
}

function indianWords(n: number): string {
  if (n === 0) return "Zero"
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${crore >= 100 ? indianWords(crore) : belowHundred(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(" ")
}

/** "Indian Rupee Seventeen Thousand Five Hundred Fifty-Six Only", Zoho's wording. */
export function amountInWords(value: number): string {
  const n = Math.abs(Number(value) || 0)
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)
  const words = `Indian Rupee ${indianWords(rupees)}`
  return paise ? `${words} and ${belowHundred(paise)} Paise Only` : `${words} Only`
}

const days = (n: number): string => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

export const PAYSLIP_CSS = `
.zp-sheet { --zp-rule: #E4E7EC; --zp-muted: #667085; --zp-green: #12B76A; --zp-green-bg: #ECFDF3;
  box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 34pt 34pt 26pt;
  display: flex; flex-direction: column; background: #fff; color: #1D2939;
  font-family: "Inter", -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 9pt; line-height: 1.45;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.zp-sheet * { box-sizing: border-box; }
.zp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20pt; padding-bottom: 14pt; border-bottom: 0.75pt solid var(--zp-rule); }
.zp-brand { display: flex; align-items: flex-start; gap: 12pt; min-width: 0; }
.zp-logo { height: 30pt; width: auto; flex: none; }
.zp-company { font-size: 12pt; font-weight: 700; color: #101828; }
.zp-address { color: var(--zp-muted); font-size: 8.5pt; max-width: 260pt; }
.zp-for { text-align: right; flex: none; }
.zp-for .zp-small { color: var(--zp-muted); font-size: 8.5pt; }
.zp-for .zp-month { font-size: 12pt; font-weight: 700; color: #101828; }
.zp-for .zp-sub { font-size: 8.5pt; color: var(--zp-muted); }
.zp-withheld { margin-top: 8pt; color: #B42318; font-weight: 600; font-size: 8.5pt; }
.zp-summary { display: flex; justify-content: space-between; gap: 24pt; padding: 14pt 0; }
.zp-label { font-size: 8pt; font-weight: 700; color: var(--zp-muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8pt; }
.zp-kv { display: grid; grid-template-columns: 96pt 8pt 1fr; row-gap: 5pt; }
.zp-kv .zp-k { color: var(--zp-muted); }
.zp-kv .zp-v { font-weight: 600; color: #101828; }
.zp-card { flex: none; width: 200pt; border: 0.75pt solid var(--zp-rule); border-radius: 8pt; overflow: hidden; align-self: flex-start; }
.zp-card-top { display: flex; gap: 10pt; padding: 12pt 14pt; background: var(--zp-green-bg); }
.zp-card-bar { width: 3pt; border-radius: 2pt; background: var(--zp-green); flex: none; }
.zp-card-amount { font-size: 16pt; font-weight: 700; color: #101828; line-height: 1.2; }
.zp-card-caption { color: var(--zp-muted); font-size: 8.5pt; }
.zp-card-days { border-top: 0.75pt dashed var(--zp-rule); padding: 9pt 14pt; display: grid; grid-template-columns: 1fr auto; row-gap: 4pt; }
.zp-card-days .zp-v { font-weight: 600; text-align: right; }
.zp-ids { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24pt; row-gap: 5pt; padding: 12pt 0 14pt; border-top: 0.75pt solid var(--zp-rule); }
.zp-ids .zp-row { display: grid; grid-template-columns: 96pt 8pt 1fr; }
.zp-ids .zp-k { color: var(--zp-muted); }
.zp-ids .zp-v { font-weight: 600; }
.zp-box { border: 0.75pt solid var(--zp-rule); border-radius: 8pt; overflow: hidden; }
.zp-pair { display: grid; grid-template-columns: 1fr 1fr; }
.zp-pair > div + div { border-left: 0.75pt solid var(--zp-rule); }
.zp-table { width: 100%; border-collapse: collapse; }
.zp-table th { font-size: 8pt; font-weight: 700; color: #344054; text-transform: uppercase; letter-spacing: 0.04em; text-align: right; padding: 9pt 10pt; border-bottom: 0.75pt solid var(--zp-rule); }
.zp-table th:first-child, .zp-table td:first-child { text-align: left; }
.zp-table td { padding: 6pt 10pt; text-align: right; white-space: nowrap; }
.zp-table td:first-child { white-space: normal; }
.zp-table tr.zp-total td { font-weight: 700; background: #F9FAFB; border-top: 0.75pt solid var(--zp-rule); padding: 8pt 10pt; }
.zp-table .zp-ytd { color: var(--zp-muted); }
.zp-gap { height: 12pt; }
.zp-net { display: flex; align-items: stretch; }
.zp-net-left { flex: 1; padding: 11pt 14pt; }
.zp-net-title { font-weight: 700; font-size: 9.5pt; color: #101828; text-transform: uppercase; letter-spacing: 0.04em; }
.zp-net-formula { color: var(--zp-muted); font-size: 8.5pt; }
.zp-net-right { flex: none; min-width: 170pt; display: flex; align-items: center; justify-content: flex-end; padding: 11pt 14pt; background: var(--zp-green-bg); font-size: 14pt; font-weight: 700; color: #101828; }
.zp-words { text-align: right; margin-top: 10pt; font-size: 8.5pt; }
.zp-words .zp-k { color: var(--zp-muted); }
.zp-words .zp-v { font-weight: 600; }
.zp-foot { margin-top: auto; padding-top: 10pt; border-top: 0.75pt solid var(--zp-rule); text-align: center; color: var(--zp-muted); font-size: 8pt; }
`

const kv = (k: string, v: string) => `<span class="zp-k">${esc(k)}</span><span class="zp-k">:</span><span class="zp-v">${esc(v)}</span>`

function table(title: string, rows: TemplateLine[], totalLabel: string, total: number, withYtd: boolean, height: number): string {
  const cells = (r: TemplateLine) =>
    `<td>${esc(r.name)}</td><td>${esc(inr(r.amount))}</td>${withYtd ? `<td class="zp-ytd">${r.ytd == null ? "-" : esc(inr(r.ytd))}</td>` : ""}`
  const blank = `<tr><td>&nbsp;</td><td></td>${withYtd ? "<td></td>" : ""}</tr>`
  return `<table class="zp-table">
    <thead><tr><th>${esc(title)}</th><th>Amount</th>${withYtd ? "<th>YTD</th>" : ""}</tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${cells(r)}</tr>`).join("")}
      ${Array.from({ length: Math.max(0, height - rows.length) }, () => blank).join("")}
      <tr class="zp-total"><td>${esc(totalLabel)}</td><td>${esc(inr(total))}</td>${withYtd ? "<td></td>" : ""}</tr>
    </tbody>
  </table>`
}

/** The payslip's markup: one `.zp-sheet` div, styled by PAYSLIP_CSS. */
export function payslipBody(p: PayslipTemplateInput): string {
  const e = p.employee || {}
  const earnings = (p.earnings || []).filter((x) => Number(x.amount) > 0)
  const deductions = (p.deductions || []).filter((x) => Number(x.amount) > 0)
  const reimbursements = (p.reimbursements || []).filter((x) => Number(x.amount) > 0)
  const height = Math.max(earnings.length, deductions.length, 1)
  const bank = e.account_last4
    ? `${e.bank_name ? `${e.bank_name} ` : ""}XXXX${e.account_last4}`
    : e.pay_mode && e.pay_mode !== "bank"
      ? `Paid by ${e.pay_mode}`
      : "-"
  const ids: [string, string][] = [
    ["PAN", e.pan_last4 ? `XXXXXX${e.pan_last4}` : "-"],
    ["UAN", e.uan || "-"],
    ...(e.esi_ip ? ([["ESI Number", e.esi_ip]] as [string, string][]) : []),
    ["Bank Account No", bank],
  ]
  const formula = `Gross Earnings - Total Deductions${reimbursements.length ? " + Reimbursements" : ""}`

  return `<div class="zp-sheet">
  <div class="zp-head">
    <div class="zp-brand">
      ${p.company.logo ? `<img class="zp-logo" src="${esc(p.company.logo)}" alt="" />` : ""}
      <div>
        <div class="zp-company">${esc(p.company.name)}</div>
        ${p.company.address.map((l) => `<div class="zp-address">${esc(l)}</div>`).join("")}
      </div>
    </div>
    <div class="zp-for">
      <div class="zp-small">Payslip For the Month</div>
      <div class="zp-month">${esc(p.month)}</div>
      ${p.title ? `<div class="zp-sub">${esc(p.title)}</div>` : ""}
    </div>
  </div>
  ${p.withheld ? `<div class="zp-withheld">This salary is withheld and has not been paid yet.</div>` : ""}

  <div class="zp-summary">
    <div>
      <div class="zp-label">Employee Summary</div>
      <div class="zp-kv">
        ${kv("Employee Name", e.name || "-")}
        ${kv("Designation", e.designation || "-")}
        ${kv("Employee ID", e.employee_code || "-")}
        ${kv("Date of Joining", slipDate(e.doj))}
        ${kv("Pay Period", p.month)}
        ${kv("Pay Date", slipDate(p.payDate))}
      </div>
    </div>
    <div class="zp-card">
      <div class="zp-card-top">
        <div class="zp-card-bar"></div>
        <div>
          <div class="zp-card-amount">${esc(inr(p.netPay))}</div>
          <div class="zp-card-caption">Total Net Pay</div>
        </div>
      </div>
      <div class="zp-card-days">
        <span class="zp-k">Paid Days</span><span class="zp-v">: ${esc(days(p.paidDays))}</span>
        <span class="zp-k">LOP Days</span><span class="zp-v">: ${esc(days(p.lopDays))}</span>
      </div>
    </div>
  </div>

  <div class="zp-ids">
    ${ids.map(([k, v]) => `<div class="zp-row">${kv(k, v)}</div>`).join("")}
  </div>

  <div class="zp-box zp-pair">
    <div>${table("Earnings", earnings, "Gross Earnings", p.gross, true, height)}</div>
    <div>${table("Deductions", deductions, "Total Deductions", p.totalDeductions, true, height)}</div>
  </div>

  ${
    reimbursements.length
      ? `<div class="zp-gap"></div><div class="zp-box">${table(
          "Reimbursements",
          reimbursements,
          "Total Reimbursements",
          p.reimbursementTotal,
          false,
          reimbursements.length,
        )}</div>`
      : ""
  }

  <div class="zp-gap"></div>
  <div class="zp-box zp-net">
    <div class="zp-net-left">
      <div class="zp-net-title">Total Net Payable</div>
      <div class="zp-net-formula">${esc(formula)}</div>
    </div>
    <div class="zp-net-right">${esc(inr(p.netPay))}</div>
  </div>
  <div class="zp-words"><span class="zp-k">Amount In Words : </span><span class="zp-v">${esc(amountInWords(p.netPay))}</span></div>

  <div class="zp-foot">-- This is a system-generated document. --</div>
</div>`
}
