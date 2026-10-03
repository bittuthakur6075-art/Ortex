// The payroll engine: pure functions, no I/O, every figure testable
// (payroll.test.js), in the manner of lib/pricing.js.
//
// Simplified on 2026-10-03 (owner's decision, docs/pm/PAYROLL_PLAN.md): no PF,
// ESI, professional tax, TDS, LWF or salary components. A person is paid one
// of two ways, both in the monthly run:
//   · MONTHLY: one salary x paid days / basis days (attendance's payable days;
//     the basis is the month's actual days or a fixed 26 / 30);
//   · DAILY WAGE: one daily rate x days worked (P and OD 1, HD 0.5; weekly
//     offs, holidays and leave are not paid).
// Overtime is paid at the regular rate (1x): one day's pay over the shift's
// hours, per hour. One-time earnings and deductions, and advance recovery,
// sit on top. Old payslips keep whatever lines they were stored with.
//
// Money is rounded to the rupee. Nothing here reads a clock: every function is
// given its month.

// ---- small helpers -------------------------------------------------------------------------

export const round = (n) => Math.round((Number(n) || 0) + Number.EPSILON)
export const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const sum = (xs) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))
const inr = (n) => `₹${round2(n).toLocaleString("en-IN")}`

/** "2026-09-01" for any date or "YYYY-MM" in that month. */
export function monthKey(m) {
  const s = String(m)
  return `${s.slice(0, 7)}-01`
}

export function daysInMonth(m) {
  const [y, mo] = monthKey(m).split("-").map(Number)
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

const monthEnd = (m) => `${monthKey(m).slice(0, 8)}${String(daysInMonth(m)).padStart(2, "0")}`

/** The Indian financial year a month belongs to: April to March. */
export function fyOf(m) {
  const [y, mo] = monthKey(m).split("-").map(Number)
  const start = mo >= 4 ? y : y - 1
  return {
    start: `${start}-04-01`,
    end: `${start + 1}-03-31`,
    label: `${start}-${String((start + 1) % 100).padStart(2, "0")}`,
  }
}

// ---- settings (payroll_settings.doc) -------------------------------------------------------------

export const DEFAULT_PAYROLL_SETTINGS = {
  // payOvertime: overtime from attendance is worked out automatically (overtimeItem).
  schedule: { basis: "actual", fixedDays: 26, payDay: 7, payOvertime: true },
}

// ---- pay terms -----------------------------------------------------------------------------------

export const PAY_TYPES = { monthly: "Monthly salary", daily: "Daily wage" }

/**
 * How a salary revision pays: { type: "monthly" | "daily", rate }. A revision
 * saved before pay types (no pay_type) is monthly at the sum of its earnings,
 * its gross; monthly_gross covers one with no earnings stored.
 */
export function payTermsOf(rev) {
  if (!rev) return null
  if (rev.pay_type === "daily") return { type: "daily", rate: round2(rev.daily_rate) }
  const gross = sum((rev.earnings || []).map((e) => e.amount))
  return { type: "monthly", rate: gross || round2(rev.monthly_gross) }
}

/** The columns a new revision is stored with (0040's NOT NULL columns kept meaningful). */
export function revisionRow({ type, rate }) {
  const r = round2(rate)
  if (type === "daily") return { pay_type: "daily", daily_rate: r, monthly_gross: 0, annual_ctc: 0, earnings: [] }
  return { pay_type: "monthly", daily_rate: null, monthly_gross: r, annual_ctc: round2(r * 12), earnings: [{ code: "SALARY", name: "Salary", kind: "earning", amount: r }] }
}

/** One day's pay: what an unpaid day costs a monthly salary, or the daily rate. */
export const dayRateOf = (terms, basisDays) =>
  terms?.type === "daily" ? Number(terms.rate) || 0 : (Number(terms?.rate) || 0) / Math.max(1, Number(basisDays) || 1)

// ---- days -----------------------------------------------------------------------------------------

/** Whether a day falls inside the month and the part of it the person was employed. */
const inSpan = (day, { month, doj, exitDate }) => day >= monthKey(month) && day <= monthEnd(month) && (!doj || day >= doj) && (!exitDate || day <= exitDate)

/** Paid days from attendance: payable days, clamped to the part of the month the person was employed. */
export function paidDaysFor({ month, payable, doj, exitDate, basis = "actual", fixedDays = 26 }) {
  const first = monthKey(month)
  const dim = daysInMonth(month)
  const last = monthEnd(month)
  const from = doj && doj > first ? doj : first
  const to = exitDate && exitDate < last ? exitDate : last
  const employedDays = from > to ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  const basisDays = basis === "fixed" ? fixedDays : dim
  // Payable days only exist while employed.
  const payableEmployed = Math.min(Number(payable) || 0, employedDays)
  if (basis !== "fixed") {
    return { basisDays, employedDays, paidDays: round2(Math.min(payableEmployed, basisDays)) }
  }
  // A fixed basis: the fixed days, scaled to the part of the month the person
  // was employed, less the days they were employed and not payable. A full
  // month with no loss of pay is the full 26.
  const lop = employedDays - payableEmployed
  const base = (basisDays * employedDays) / dim
  return { basisDays, employedDays, paidDays: round2(Math.max(0, Math.min(basisDays, base - lop))) }
}

/**
 * Payable days per person from attendance_month_summary ({ rows, error }).
 * A summary that could not be read REFUSES the run (throws) rather than paying
 * everyone the full month. A person with no row gets the full month, marked
 * `missing` so the run screen can say so.
 */
export function payableFrom(att, month) {
  if (att?.error) throw new Error(`Attendance for ${monthKey(month).slice(0, 7)} could not be read, so nothing was calculated: ${att.error}`)
  const byUser = new Map((att?.rows || []).map((r) => [r.user_id, Number(r.payable)]))
  return (userId) => (byUser.has(userId) ? { payable: byUser.get(userId), missing: false } : { payable: daysInMonth(month), missing: true })
}

/** What a day counts for a daily wage, by its effective status. Everything else (WO, H, L, LOP, A, MP) is 0. */
export const DAY_WEIGHT = { P: 1, OD: 1, HD: 0.5 }

/**
 * Days worked in the month for a daily wage: the person's attendance days
 * ({ day, status }, the effective status) weighed by DAY_WEIGHT, inside the
 * month and the employed span.
 */
export function daysWorkedFrom(rows, { month, doj, exitDate }) {
  return round2((rows || []).filter((r) => inSpan(String(r.day).slice(0, 10), { month, doj, exitDate })).reduce((s, r) => s + (DAY_WEIGHT[r.status] || 0), 0))
}

// ---- overtime at the regular rate ---------------------------------------------------------------------

const clock = (t) => (/^\d{1,2}:\d{2}$/.test(String(t || "")) ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null)

/**
 * The full-day shift's length in minutes from attendance settings' `shift`
 * ({ start, end } "HH:MM"), 09:30 to 18:30 when unset. An end at or before the
 * start runs past midnight, as attendance_recompute_day (0056) reads it. The
 * half Saturday is ignored: the hourly rate is the full day's.
 */
export function shiftMinutes(shift) {
  let start = clock(shift?.start)
  let end = clock(shift?.end)
  if (start == null || end == null) [start, end] = [570, 1110]
  return end > start ? end - start : end + 1440 - start
}

/** "12h 30m", "10h", "45m". */
export const hoursWords = (min) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m"
}

/** The month's overtime minutes from the person's attendance_overtime days ({ day, minutes }), inside the month and the employed span. */
export function overtimeMinutes(rows, { month, doj, exitDate }) {
  return Math.round((rows || []).filter((r) => inSpan(String(r.day).slice(0, 10), { month, doj, exitDate })).reduce((s, r) => s + (Number(r.minutes) || 0), 0))
}

/**
 * The month's overtime as an earning, paid at the REGULAR rate (the owner's
 * decision: no 1.5x or 2x, off days included): one day's pay (dayRateOf) over
 * the shift's hours, per hour. `mode` "manual" pays `amount` instead, typed by
 * payroll after seeing the hours (0 pays nothing). Null when there is nothing
 * to pay, or when payroll added an OVERTIME one-time item by hand (an older
 * draft's way, which wins).
 */
export function overtimeItem({ minutes = 0, mode = "auto", amount = null, dayRate = 0, shiftMin = 540, oneTime = [] }) {
  if (oneTime.some((o) => o.code === "OVERTIME")) return null
  const hourlyRate = round2((Number(dayRate) || 0) / (Math.max(1, shiftMin) / 60))
  const manual = mode === "manual"
  const pay = manual ? round(Math.max(0, Number(amount) || 0)) : round((minutes / 60) * ((Number(dayRate) || 0) / (Math.max(1, shiftMin) / 60)))
  if (pay <= 0) return null
  return {
    kind: "earning",
    code: "OVERTIME",
    name: "Overtime",
    amount: pay,
    note: manual ? `${hoursWords(minutes)}, amount entered` : `${hoursWords(minutes)} at ${inr(hourlyRate)}/h`,
    data: { minutes, hours: round2(minutes / 60), hourlyRate, auto: !manual },
  }
}

// ---- advances ------------------------------------------------------------------------------------------

/**
 * This month's recovery of an advance: the instalment (or payroll's amount for
 * this run, `recover`; 0 skips it), never more than the balance.
 */
export function recoveryFor(loan, recover) {
  const want = recover == null || recover === "" ? Number(loan.instalment) || 0 : Math.max(0, Number(recover) || 0)
  return round2(Math.min(want, Math.max(0, Number(loan.balance) || 0)))
}

/** Instalment for an advance recovered over `months` (1 = in full). */
export const instalmentFor = (amount, months) => round2(Math.ceil(((Number(amount) || 0) * 100) / Math.max(1, Math.floor(Number(months) || 1))) / 100)

// ---- one month's payslip ----------------------------------------------------------------------------

/**
 * The payslip for one person for one month.
 *
 * `terms` is { type, rate } (payTermsOf), or null for an off-cycle run, which
 * pays only its one-time items. Monthly: `paidDays` of `basisDays` are paid.
 * Daily: `daysWorked` x rate. `oneTime` are extra earnings (bonus, incentive,
 * overtime) and deductions (other recoveries). `loans` are open advances
 * ({ id, name, balance, instalment }); `recover` is { [loanId]: amount } for
 * this run. Deductions never take more than the gross: what does not fit is
 * carried to the next month.
 */
export function computePayslip({ month, terms, paidDays = 0, basisDays, daysWorked = 0, oneTime = [], loans = [], recover = {} }) {
  const basis = Math.max(1, Number(basisDays) || daysInMonth(month))
  const base = []
  let days = {}
  if (terms?.type === "monthly") {
    const paid = Math.min(basis, Math.max(0, Number(paidDays) || 0))
    base.push({ code: "SALARY", name: "Salary", kind: "earning", amount: round((terms.rate * paid) / basis), full: round2(terms.rate), note: `${inr(terms.rate)}, paid days ${round2(paid)} of ${basis}` })
    days = { paidDays: round2(paid), basisDays: basis, lopDays: round2(basis - paid) }
  } else if (terms?.type === "daily") {
    const worked = Math.max(0, Number(daysWorked) || 0)
    base.push({ code: "WAGES", name: "Daily wage", kind: "earning", amount: round(worked * terms.rate), note: `days worked ${round2(worked)} x ${inr(terms.rate)}` })
    days = { daysWorked: round2(worked) }
  }
  const extra = oneTime
    .filter((o) => o.kind === "earning" && Number(o.amount) > 0)
    .map((o) => ({
      code: o.code || "ONE_TIME",
      name: o.name,
      kind: "earning",
      amount: round(o.amount),
      oneTime: true,
      ...(o.note ? { note: o.note } : {}),
      ...(o.data ? { data: o.data } : {}),
    }))
  const earnings = [...base, ...extra]
  const gross = sum(earnings.map((e) => e.amount))

  const wanted = [
    ...oneTime.filter((o) => o.kind === "deduction" && Number(o.amount) > 0).map((o) => ({ code: o.code || "RECOVERY", name: o.name, amount: round(o.amount), oneTime: true })),
    ...loans
      .filter((l) => Number(l.balance) > 0)
      .map((l) => {
        const amount = recoveryFor(l, recover[l.id])
        return { code: "LOAN", name: `${l.name || "Advance"} recovered`, loanId: l.id, amount, balance: round2(l.balance) }
      })
      .filter((d) => d.amount > 0),
  ]
  // Net pay is never below zero: what does not fit is carried forward.
  let room = gross
  const deductions = []
  const carried = []
  for (const d of wanted) {
    const take = round2(Math.max(0, Math.min(d.amount, room)))
    if (take > 0) {
      const line = { ...d, amount: take }
      if (d.loanId) {
        line.balanceAfter = round2(d.balance - take)
        line.note = `balance ${inr(line.balanceAfter)}`
        delete line.balance
      }
      deductions.push(line)
    }
    if (take < d.amount) carried.push({ code: d.code, name: d.name, amount: round2(d.amount - take), ...(d.loanId ? { loanId: d.loanId } : {}) })
    room = round2(room - take)
  }
  const totalDeductions = sum(deductions.map((d) => d.amount))

  return {
    month: monthKey(month),
    ...(terms ? { payType: terms.type, rate: round2(terms.rate) } : {}),
    ...days,
    earnings,
    gross,
    deductions,
    carried,
    totalDeductions,
    netPay: round2(gross - totalDeductions),
  }
}

/** How a line is matched across months for its YTD figure. */
export const lineKey = (x) => `${x.code || ""}|${x.name || ""}`

/**
 * Year-to-date per line, printed beside each amount: this payslip plus every
 * paid payslip earlier in the same financial year (`prior` is their `data`).
 */
export function ytdLines(prior, slip) {
  const add = (side) => {
    const out = {}
    for (const d of [...(prior || []), slip]) {
      for (const x of d?.[side] || []) out[lineKey(x)] = round2((out[lineKey(x)] || 0) + (Number(x.amount) || 0))
    }
    return out
  }
  return { earnings: add("earnings"), deductions: add("deductions") }
}

// ---- the run's totals and the month-on-month check ----------------------------------------------------

export function runTotals(payslips) {
  const inc = payslips.filter((p) => p.status !== "skipped")
  return {
    employees: inc.length,
    gross: sum(inc.map((p) => p.gross)),
    deductions: sum(inc.map((p) => p.totalDeductions)),
    netPay: sum(inc.map((p) => p.netPay)),
    withheld: inc.filter((p) => p.status === "withheld").length,
  }
}

/** Net pay changed by more than `pct` (or a new / missing person): the rows to look at before approving. */
export function varianceFlags(current, previous, pct = 10) {
  const prev = new Map((previous || []).map((p) => [p.user_id, p]))
  const flags = []
  for (const p of current) {
    const was = prev.get(p.user_id)
    if (!was) {
      flags.push({ user_id: p.user_id, kind: "new", text: "Not paid last month" })
      continue
    }
    const diff = round2(p.netPay - was.netPay)
    const rel = was.netPay ? Math.abs(diff) / was.netPay : 1
    if (rel * 100 >= pct) {
      flags.push({
        user_id: p.user_id,
        kind: diff > 0 ? "up" : "down",
        diff,
        text: `Net pay ${diff > 0 ? "up" : "down"} ₹${Math.abs(round(diff)).toLocaleString("en-IN")} on last month`,
      })
    }
  }
  for (const [uid] of prev) if (!current.some((p) => p.user_id === uid)) flags.push({ user_id: uid, kind: "gone", text: "Paid last month, not this month" })
  return flags
}

// ---- the bank file ---------------------------------------------------------------------------------------

const csvCell = (v) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n")

/** A generic NEFT bulk-transfer CSV; the column order is the bank's, set in Settings. */
export function bankFileRows(payslips, employees, { debitAccount = "", narration = "Salary", date = "", columns } = {}) {
  const cols = columns || ["mode", "debit_account", "beneficiary_name", "account_number", "ifsc", "amount", "date", "narration", "email"]
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  const header = cols.map((c) => c.toUpperCase())
  const rows = payslips
    .filter((p) => p.status === "included" && p.netPay > 0)
    .map((p) => {
      const e = byUser.get(p.user_id) || {}
      const v = {
        mode: String(e.ifsc || "").slice(0, 4) === String(e.debitIfsc || "").slice(0, 4) ? "IFT" : "NEFT",
        debit_account: debitAccount,
        beneficiary_name: e.account_holder || e.name || "",
        account_number: e.account_number || "",
        ifsc: e.ifsc || "",
        amount: round2(p.netPay).toFixed(2),
        date,
        narration: `${narration} ${p.monthLabel || ""}`.trim(),
        email: e.email || "",
      }
      return cols.map((c) => v[c] ?? "")
    })
  return [header, ...rows]
}

// ---- words for a payslip ---------------------------------------------------------------------------------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`)
const three = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${n % 100 ? two(n % 100) : ""}`

/** "Rupees Twenty Three Thousand Four Hundred Only" (Indian grouping). */
export function rupeesInWords(amount) {
  let n = Math.floor(Math.abs(Number(amount) || 0))
  if (n === 0) return "Rupees Zero Only"
  const parts = []
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
