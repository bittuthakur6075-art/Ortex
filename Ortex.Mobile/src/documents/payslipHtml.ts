import type { Settings } from "@/domain/settings"
import { DOCUMENT_FONT_WOFF2_BASE64 } from "@/documents/documentFont"
import { PAYSLIP_CSS, payslipBody, type TemplateLine } from "@/documents/payslipTemplate"
import { monthLabel, type PayLine, type Payslip } from "@/features/pay/payFormat"
import { ORTEX_WORDMARK_DATA_URI } from "@/theme/logo"

// The printable A4 payslip, Zoho Payroll's standard layout. The page itself is
// documents/payslipTemplate.ts, shared line for line with the console, so a
// payslip downloaded on the phone and one downloaded at the desk are the same
// document. This file only feeds it from a payslip row and wraps it for
// expo-print (lib/payslipPdf.ts).
//
// Everything printed comes from the payslip's own snapshot (payslips.data,
// migration 0040), never from the employee's current profile: a payslip is a
// record of the month it was paid.

const key = (x: PayLine) => `${x.code || ""}|${x.name || ""}`

const withYtd = (xs: PayLine[] | undefined, ytd: Record<string, number> | undefined): TemplateLine[] =>
  (xs || []).map((x) => ({ name: x.name, amount: Number(x.amount) || 0, ytd: ytd ? (ytd[key(x)] ?? null) : null }))

export function payslipHtml(slip: Payslip, settings: Settings | null): string {
  const d = slip.data
  const address = (settings?.company?.address || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const body = payslipBody({
    company: { name: settings?.company?.name?.trim() || "Ortex Industries", address, logo: ORTEX_WORDMARK_DATA_URI },
    month: monthLabel(d.month),
    withheld: slip.status === "withheld",
    payDate: d.payDate || slip.released_at || null,
    employee: d.employee || {},
    paidDays: d.paidDays,
    lopDays: d.lopDays,
    earnings: withYtd(d.earnings, d.ytdLines?.earnings),
    deductions: withYtd(d.deductions, d.ytdLines?.deductions),
    reimbursements: withYtd(d.reimbursements, undefined),
    gross: d.gross,
    totalDeductions: d.totalDeductions,
    reimbursementTotal: d.reimbursementTotal,
    netPay: d.netPay,
  })

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Payslip ${monthLabel(d.month)}</title>
<style>
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 100 900;
    font-display: block;
    src: url(data:font/woff2;base64,${DOCUMENT_FONT_WOFF2_BASE64}) format("woff2");
  }
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
${PAYSLIP_CSS}
</style>
</head>
<body>
${body}
</body>
</html>`
}
