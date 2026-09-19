import { formatCurrency } from "@/domain/format"

/**
 * Payroll on the phone, the pure half: the shapes the console's engine writes
 * (Ortex.Admin/src/lib/payroll.js computePayslip, stored in payslips.data by
 * migration 0040) and the arithmetic the pay pages draw from them. `fyOf` and
 * `rupeesInWords` are line-for-line ports of the engine's; test/pay.test.mjs
 * runs both copies side by side, so a payslip never says one thing in words on
 * the phone and another on the console's PDF.
 */

// ---- shapes ----------------------------------------------------------------------------------------

export type PayLine = {
  code: string
  name: string
  amount: number
  taxable?: boolean
  oneTime?: boolean
  full?: number
}

export type PayslipEmployee = {
  name?: string
  email?: string
  employee_code?: string | null
  designation?: string | null
  department?: string | null
  doj?: string | null
  pan_last4?: string | null
  uan?: string | null
  esi_ip?: string | null
  bank_name?: string | null
  account_last4?: string | null
  ifsc?: string | null
  pay_mode?: string | null
}

export type PayslipData = {
  month: string
  paidDays: number
  basisDays: number
  lopDays: number
  earnings: PayLine[]
  gross: number
  deductions: PayLine[]
  totalDeductions: number
  reimbursements: PayLine[]
  reimbursementTotal: number
  netPay: number
  employer: PayLine[]
  employerTotal: number
  tds?: { monthly?: number; annualTax?: number; taxable?: number; annualGross?: number; regime?: "new" | "old" }
  employee?: PayslipEmployee
  revision?: { annual_ctc?: number; effective_from?: string }
  /** The run pay date and each line year to date (code|name), printed as Zoho does. */
  payDate?: string | null
  ytdLines?: { earnings?: Record<string, number>; deductions?: Record<string, number> }
}

export type Payslip = {
  id: string
  run_id: string
  status: "included" | "skipped" | "withheld"
  data: PayslipData
  gross: number
  net_pay: number
  released_at: string
}

export type SalaryRevision = {
  id: string
  effective_from: string
  payout_month: string
  annual_ctc: number
  earnings: PayLine[]
  monthly_gross: number
  employer_pf_in_ctc: number
  reason: string | null
  created_at: string
}

export type Loan = {
  id: string
  name: string
  amount: number
  instalment: number
  start_month: string
  disbursed_on: string | null
  status: "active" | "paused" | "closed"
  note: string | null
  recovered: number
  balance: number
}

export type ClaimStatus = "pending" | "approved" | "rejected" | "paid" | "cancelled"

export type Claim = {
  id: string
  category: string
  amount: number
  bill_date: string
  description: string | null
  receipt_path: string | null
  status: ClaimStatus
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

// ---- engine ports (Ortex.Admin/src/lib/payroll.js) -----------------------------------------------

/** "2026-09-01" for any date or "YYYY-MM" in that month. */
export function monthKey(m: string): string {
  return `${String(m).slice(0, 7)}-01`
}

/** The Indian financial year a month belongs to: April to March. */
export function fyOf(m: string): { start: string; end: string; label: string } {
  const [y, mo] = monthKey(m).split("-").map(Number)
  const start = mo >= 4 ? y : y - 1
  return {
    start: `${start}-04-01`,
    end: `${start + 1}-03-31`,
    label: `${start}-${String((start + 1) % 100).padStart(2, "0")}`,
  }
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const two = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`)
const three = (n: number): string =>
  `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${n % 100 ? two(n % 100) : ""}`

/** "Rupees Twenty Three Thousand Four Hundred Only" (Indian grouping). */
export function rupeesInWords(amount: unknown): string {
  let n = Math.floor(Math.abs(Number(amount) || 0))
  if (n === 0) return "Rupees Zero Only"
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lakh = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (crore) parts.push(`${three(crore)} Crore`)
  if (lakh) parts.push(`${two(lakh)} Lakh`)
  if (thousand) parts.push(`${two(thousand)} Thousand`)
  if (n) parts.push(three(n))
  return `Rupees ${parts.join(" ")} Only`
}

// ---- words and money -------------------------------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "September 2026" */
export function monthLabel(m: string): string {
  const [y, mo] = monthKey(m).split("-").map(Number)
  return `${MONTHS[mo - 1] || ""} ${y}`.trim()
}

/** "Sep" */
export function monthShort(m: string): string {
  const mo = Number(monthKey(m).slice(5, 7))
  return (MONTHS[mo - 1] || "").slice(0, 3)
}

/** "FY 2026-27" */
export const fyWords = (m: string) => `FY ${fyOf(m).label}`

const round2 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

/** ₹23,400 for whole rupees, ₹23,400.50 when there are paise. */
export function money(n: unknown): string {
  const v = round2(Number(n) || 0)
  const s = formatCurrency(v)
  return Number.isInteger(v) ? s.replace(/\.00$/, "") : s
}

/** "22 days", "1 day", "21.5 days" */
export function daysText(n: unknown): string {
  const v = round2(Number(n) || 0)
  return `${v} ${v === 1 ? "day" : "days"}`
}

// ---- a payslip, summed ---------------------------------------------------------------------------

const sum = (xs: (PayLine | undefined)[]) => round2(xs.reduce((s, x) => s + (Number(x?.amount) || 0), 0))

/** Income tax deducted on this payslip. */
export const tdsOf = (d: PayslipData) => sum((d.deductions || []).filter((x) => x.code === "TDS"))

/** Every deduction other than income tax: PF, ESI, LWF, loans, recoveries. */
export const otherDeductionsOf = (d: PayslipData) => round2((Number(d.totalDeductions) || 0) - tdsOf(d))

/** Newest month first; a later release breaks a tie (an off-cycle run for the same month). */
export function sortSlips(slips: Payslip[]): Payslip[] {
  return [...slips].sort((a, b) => {
    const am = monthKey(a.data?.month || a.released_at)
    const bm = monthKey(b.data?.month || b.released_at)
    if (am !== bm) return am < bm ? 1 : -1
    return a.released_at < b.released_at ? 1 : -1
  })
}

export type FyGroup = { fy: string; start: string; slips: Payslip[] }

/** Payslips grouped by financial year, newest year first, newest slip first inside it. */
export function groupByFy(slips: Payslip[]): FyGroup[] {
  const groups = new Map<string, FyGroup>()
  for (const s of sortSlips(slips)) {
    const fy = fyOf(s.data?.month || s.released_at)
    const g = groups.get(fy.label) || { fy: fy.label, start: fy.start, slips: [] }
    g.slips.push(s)
    groups.set(fy.label, g)
  }
  return [...groups.values()].sort((a, b) => (a.start < b.start ? 1 : -1))
}

export type YtdTotals = {
  fy: string
  count: number
  gross: number
  net: number
  tds: number
  deductions: number
  reimbursements: number
}

/**
 * Year to date for the financial year of `month` (default: the newest payslip's).
 * gross + reimbursements = net + deductions + tds, which is what lets the
 * donut's three slices add up to the figure in its centre.
 */
export function ytdTotals(slips: Payslip[], month?: string): YtdTotals {
  const sorted = sortSlips(slips)
  const anchor = month || sorted[0]?.data?.month
  if (!anchor) return { fy: "", count: 0, gross: 0, net: 0, tds: 0, deductions: 0, reimbursements: 0 }
  const fy = fyOf(anchor)
  const inFy = sorted.filter((s) => {
    const m = monthKey(s.data?.month || s.released_at)
    return m >= fy.start && m <= fy.end
  })
  const t = inFy.reduce(
    (acc, s) => {
      const d = s.data || ({} as PayslipData)
      acc.gross += Number(d.gross ?? s.gross) || 0
      acc.net += Number(d.netPay ?? s.net_pay) || 0
      acc.tds += tdsOf(d)
      acc.deductions += otherDeductionsOf(d)
      acc.reimbursements += Number(d.reimbursementTotal) || 0
      return acc
    },
    { gross: 0, net: 0, tds: 0, deductions: 0, reimbursements: 0 },
  )
  return {
    fy: fy.label,
    count: inFy.length,
    gross: round2(t.gross),
    net: round2(t.net),
    tds: round2(t.tds),
    deductions: round2(t.deductions),
    reimbursements: round2(t.reimbursements),
  }
}

/** The last `n` payslips, oldest first, for the monthly net-pay bars. */
export function netPayTrend(slips: Payslip[], n = 6): { month: string; label: string; net: number; id: string }[] {
  return sortSlips(slips)
    .slice(0, n)
    .reverse()
    .map((s) => ({
      id: s.id,
      month: monthKey(s.data?.month || s.released_at),
      label: monthShort(s.data?.month || s.released_at),
      net: Number(s.data?.netPay ?? s.net_pay) || 0,
    }))
}

// ---- loans -----------------------------------------------------------------------------------------

/** What has been recovered and what is left; never below zero. */
export function loanProgress(amount: number, recoveries: { amount: number }[]): { recovered: number; balance: number } {
  const recovered = round2(recoveries.reduce((s, r) => s + (Number(r.amount) || 0), 0))
  return { recovered, balance: round2(Math.max(0, (Number(amount) || 0) - recovered)) }
}

// ---- claims ----------------------------------------------------------------------------------------

export const CLAIM_CATEGORIES = ["Fuel", "Travel", "Phone", "Food", "Medical", "Other"] as const

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export const CLAIM_STATUS_TONE: Record<ClaimStatus, "amber" | "blue" | "emerald" | "rose" | "slate"> = {
  pending: "amber",
  approved: "blue",
  paid: "emerald",
  rejected: "rose",
  cancelled: "slate",
}

/** The server accepts bills from today back to 90 days ago (claim_submit). */
export const CLAIM_MAX_AGE_DAYS = 90

/** "YYYY-MM-DD" `delta` days from `day`. */
export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10)
}

/**
 * Why a claim cannot be sent yet, in words, or null. Mirrors claim_submit's
 * own checks (amount 1 to 2,00,000, bill within 90 days) so the refusal
 * arrives before the button is pressed.
 */
export function claimBlocker(
  c: { category: string; amount: string; billDate: string; hasReceipt: boolean },
  today: string,
): string | null {
  if (!c.category) return "Choose a category"
  const amount = Number(c.amount.replace(/,/g, ""))
  if (!c.amount.trim() || !Number.isFinite(amount) || amount <= 0) return "Enter the amount"
  if (amount > 200000) return "A single claim can be at most ₹2,00,000"
  if (c.billDate > today) return "The bill date cannot be in the future"
  if (c.billDate < shiftDay(today, -CLAIM_MAX_AGE_DAYS)) return "Claim bills from the last 90 days"
  if (!c.hasReceipt) return "Add a photo of the bill"
  return null
}
