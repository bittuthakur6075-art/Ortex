import { formatDate } from "@/domain/format"
import type { Settings } from "@/domain/settings"
import { DOCUMENT_FONT_WOFF2_BASE64 } from "@/documents/documentFont"
import {
  daysText,
  money,
  monthLabel,
  rupeesInWords,
  type PayLine,
  type Payslip,
} from "@/features/pay/payFormat"
import { ORTEX_WORDMARK_DATA_URI } from "@/theme/logo"

// The printable A4 payslip (Zoho Payroll's layout: company head, employee
// snapshot, earnings and deductions side by side, net pay in figures and
// words). It shares the quotation's geometry and typeface (quotationHtml.ts),
// so the two documents the phone prints look like one company's paperwork, and
// it is rendered the same way, by expo-print (lib/pdf.ts).
//
// Everything printed comes from the payslip's own snapshot (payslips.data,
// migration 0040), never from the employee's current profile: a payslip is a
// record of the month it was paid, and a later change of designation or bank
// must not rewrite it.

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const row = (name: string, amount: number) =>
  `<tr><td>${esc(name)}</td><td class="num">${esc(money(amount))}</td></tr>`

const lines = (xs: PayLine[] | undefined) => (xs || []).filter((x) => Number(x.amount) > 0)

export function payslipHtml(slip: Payslip, settings: Settings | null): string {
  const d = slip.data
  const e = d.employee || {}
  const company = settings?.company?.name?.trim() || "Ortex Industries"
  const address = (settings?.company?.address || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ")
  const month = monthLabel(d.month)
  const earnings = lines(d.earnings)
  const deductions = lines(d.deductions)
  const reimbursements = lines(d.reimbursements)

  const facts: [string, string][] = [
    ["Employee name", e.name || "-"],
    ["Employee ID", e.employee_code || "-"],
    ["Designation", e.designation || "-"],
    ["Department", e.department || "-"],
    ["Date of joining", e.doj ? formatDate(e.doj) : "-"],
    ["Pay period", month],
    ["Paid days", daysText(d.paidDays)],
    ["Loss of pay days", daysText(d.lopDays)],
    ["PAN", e.pan_last4 ? `XXXXXX${e.pan_last4}` : "-"],
    ["UAN", e.uan || "-"],
    ...(e.esi_ip ? ([["ESI number", e.esi_ip]] as [string, string][]) : []),
    ["Bank account", e.account_last4 ? `${e.bank_name ? `${e.bank_name} ` : ""}XXXX${e.account_last4}` : e.pay_mode === "cash" ? "Paid in cash" : "-"],
  ]

  // Earnings and deductions side by side, padded to the same height so the
  // two totals sit on one line.
  const height = Math.max(earnings.length, deductions.length, 1)
  const pad = (xs: PayLine[]) =>
    xs.map((x) => row(x.name, x.amount)).join("") +
    Array.from({ length: height - xs.length }, () => `<tr><td>&nbsp;</td><td></td></tr>`).join("")

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Payslip ${esc(month)}</title>
<style>
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 100 900;
    font-display: block;
    src: url(data:font/woff2;base64,${DOCUMENT_FONT_WOFF2_BASE64}) format("woff2");
  }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .sheet {
    --rule: #EBEBEB;
    width: 210mm; min-height: 297mm; margin: 0 auto; padding: 30pt;
    display: flex; flex-direction: column;
    background: #fff; color: #000;
    font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 9pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24pt; }
  .company { font-size: 12pt; font-weight: 600; }
  .address { color: #000; max-width: 300pt; }
  .logo { height: 24pt; width: auto; flex: none; }
  .title { margin-top: 20pt; font-size: 18pt; font-weight: 600; line-height: 1.2; text-transform: uppercase; }
  .period { font-size: 11pt; font-weight: 500; margin-top: 2pt; }
  .facts { margin-top: 17pt; display: grid; grid-template-columns: 90pt 1fr 90pt 1fr; column-gap: 12pt; }
  .facts .k { font-weight: 400; }
  .facts .v { font-weight: 600; }
  .net { margin-top: 20pt; padding: 10pt 0; border-top: 0.75pt solid #000; border-bottom: 0.75pt solid var(--rule); display: flex; justify-content: space-between; align-items: baseline; }
  .net .label { font-size: 9pt; }
  .net .amount { font-size: 16pt; font-weight: 600; }
  .words { margin-top: 4pt; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24pt; margin-top: 20pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; font-weight: 400; font-size: 7.5pt; padding: 0 0 5.7pt; border-bottom: 0.75pt solid #000; }
  th.num, td.num { text-align: right; }
  td { padding: 4pt 0 0; vertical-align: top; }
  tr.total td { font-weight: 600; border-top: 0.75pt solid var(--rule); padding-top: 4pt; margin-top: 4pt; }
  .block { margin-top: 20pt; }
  .block h4 { margin: 0 0 4pt; font-size: 9pt; font-weight: 600; }
  .note { font-size: 7.5pt; }
  .foot { margin-top: auto; padding-top: 6pt; border-top: 0.75pt solid var(--rule); display: flex; justify-content: space-between; gap: 12pt; font-size: 7.5pt; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="company">${esc(company)}</div>
        ${address ? `<div class="address">${esc(address)}</div>` : ""}
      </div>
      <img class="logo" src="${ORTEX_WORDMARK_DATA_URI}" alt="${esc(company)}" />
    </div>

    <div class="title">Payslip</div>
    <div class="period">${esc(month)}</div>

    <div class="facts">
      ${facts.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>`).join("")}
    </div>

    <div class="pair">
      <table>
        <thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${pad(earnings)}
          <tr class="total"><td>Gross earnings</td><td class="num">${esc(money(d.gross))}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${pad(deductions)}
          <tr class="total"><td>Total deductions</td><td class="num">${esc(money(d.totalDeductions))}</td></tr>
        </tbody>
      </table>
    </div>

    ${
      reimbursements.length
        ? `<div class="block">
      <table>
        <thead><tr><th>Reimbursements</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${reimbursements.map((x) => row(x.name, x.amount)).join("")}
          <tr class="total"><td>Total reimbursements</td><td class="num">${esc(money(d.reimbursementTotal))}</td></tr>
        </tbody>
      </table>
    </div>`
        : ""
    }

    <div class="net">
      <span class="label">Net pay (gross earnings${reimbursements.length ? " + reimbursements" : ""} - total deductions)</span>
      <span class="amount">${esc(money(d.netPay))}</span>
    </div>
    <div class="words">${esc(rupeesInWords(d.netPay))}</div>

    ${
      lines(d.employer).length
        ? `<div class="block">
      <h4>Employer contributions (not deducted from you)</h4>
      <table><tbody>
        ${lines(d.employer).map((x) => row(x.name, x.amount)).join("")}
      </tbody></table>
    </div>`
        : ""
    }

    ${
      d.tds && (Number(d.tds.annualTax) > 0 || Number(d.tds.monthly) > 0)
        ? `<div class="block note">Income tax: ${esc(d.tds.regime === "old" ? "old" : "new")} regime. Projected tax for the year ${esc(
            money(d.tds.annualTax || 0),
          )}; deducted this month ${esc(money(d.tds.monthly || 0))}.</div>`
        : ""
    }

    <div class="foot">
      <span>This is a system-generated payslip.</span>
      <span>${esc(company)} · ${esc(month)}</span>
    </div>
  </div>
</body>
</html>`
}
