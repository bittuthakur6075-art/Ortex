// The payroll engine: pure functions, no I/O, every figure testable
// (payroll.test.js), in the manner of lib/pricing.js.
//
// Modelled on Zoho Payroll (India) and the rules as researched on 2026-09-19
// (docs/pm/PAYROLL_PLAN.md):
//   · a salary is an annual CTC split by a template into monthly components;
//     the "balance" component (Fixed / Special allowance) absorbs whatever the
//     others leave, after the employer's PF when that is inside the CTC;
//   · a month pays for PAID DAYS: attendance's payable days (already net of
//     unpaid leave, absences and the late penalty) over the salary basis
//     (the month's actual days, or a fixed 26 / 30);
//   · the Code on Wages "wages" (Basic + DA + everything not excluded) is the
//     base for PF; if the excluded items (HRA, conveyance, ...) exceed half of
//     the remuneration, the excess is added back (s.2(y));
//   · EPF 12% / 12% (8.33% of it to EPS) on wages capped at the ceiling in
//     force for the month (a DATED setting: ₹15,000, and ₹25,000 once
//     notified); EDLI and admin 0.5% each;
//   · ESI 0.75% / 3.25% of gross for the eligible, rounded UP to the rupee;
//   · Delhi Labour Welfare Fund ₹0.75 / ₹2.25 in June and December;
//   · TDS: the year's taxable salary projected every month, the year's tax
//     (new regime by default, FY 2026-27 slabs, standard deduction, s.87A
//     rebate with marginal relief, 4% cess) less TDS already deducted, spread
//     over the months left;
//   · deductions may not exceed half the month's wages (Code on Wages s.18):
//     loan instalments and one-time deductions give way first, and what they
//     give up is carried forward.
//
// Money is rounded to the rupee except the Labour Welfare Fund, which is in
// paise by law. Nothing here reads a clock: every function is given its month.

// ---- small helpers -------------------------------------------------------------------------

export const round = (n) => Math.round((Number(n) || 0) + Number.EPSILON)
export const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const sum = (xs) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))

/** "2026-09-01" for any date or "YYYY-MM" in that month. */
export function monthKey(m) {
  const s = String(m)
  return `${s.slice(0, 7)}-01`
}

export function daysInMonth(m) {
  const [y, mo] = monthKey(m).split("-").map(Number)
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

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

/** Months left in the financial year, this one included (April 12 … March 1). */
export function monthsLeftInFy(m) {
  const mo = Number(monthKey(m).slice(5, 7))
  return mo >= 4 ? 12 - (mo - 4) : 4 - mo
}

// ---- defaults (Zoho-style settings; payroll_settings.doc) --------------------------------------

export const DEFAULT_PAYROLL_SETTINGS = {
  schedule: { basis: "actual", fixedDays: 26, payDay: 7 },
  epf: {
    enabled: true,
    employeeRate: 12,
    employerRate: 12,
    epsRate: 8.33,
    edliRate: 0.5,
    adminRate: 0.5,
    restrictToCeiling: true,
    includeEmployerInCtc: true,
    // Dated, because the ceiling changes by notification. ₹25,000 was approved
    // by the Cabinet on 16 Sep 2026; add it here once EPFO notifies the date.
    ceilings: [{ from: "2014-09-01", amount: 15000 }],
  },
  esi: { enabled: true, employeeRate: 0.75, employerRate: 3.25, grossCeiling: 21000 },
  lwf: { enabled: true, employee: 0.75, employer: 2.25, months: [6, 12] },
  pt: { enabled: false },
  tds: { enabled: true, defaultRegime: "new" },
  deductionCapPct: 50,
}

export const DEFAULT_COMPONENTS = [
  // calc: pct_ctc (of monthly CTC), pct_basic, flat (monthly), balance.
  // in_wages: counts as "wages" under the Code on Wages (the PF base).
  { code: "BASIC", name: "Basic", kind: "earning", calc: "pct_ctc", value: 50, taxable: true, in_wages: true },
  { code: "HRA", name: "House rent allowance", kind: "earning", calc: "pct_basic", value: 40, taxable: true, in_wages: false },
  { code: "CONV", name: "Conveyance allowance", kind: "earning", calc: "flat", value: 1600, taxable: true, in_wages: false },
  { code: "FIXED", name: "Fixed allowance", kind: "earning", calc: "balance", value: 0, taxable: true, in_wages: true },
]

/** The PF wage ceiling in force for a month: the latest entry from on or before its last day. */
export function pfCeilingFor(m, epf = DEFAULT_PAYROLL_SETTINGS.epf) {
  const end = `${monthKey(m).slice(0, 8)}${String(daysInMonth(m)).padStart(2, "0")}`
  const list = [...(epf.ceilings || [])].sort((a, b) => (a.from < b.from ? -1 : 1))
  let amount = 15000
  for (const c of list) if (c.from <= end) amount = Number(c.amount) || amount
  return amount
}

// ---- Code on Wages -------------------------------------------------------------------------------

/**
 * "Wages" for PF / gratuity / bonus: the in-wages components, plus whatever the
 * excluded ones (HRA, conveyance, ...) carry above half the remuneration.
 */
export function codeWages(earnings) {
  const total = sum(earnings.map((e) => e.amount))
  const inWages = sum(earnings.filter((e) => e.in_wages).map((e) => e.amount))
  const excluded = round2(total - inWages)
  const addBack = excluded > total / 2 ? round2(excluded - total / 2) : 0
  return { total, wages: round2(inWages + addBack), addBack }
}

// ---- EPF -----------------------------------------------------------------------------------------

export function epfFor(wages, m, epf = DEFAULT_PAYROLL_SETTINGS.epf) {
  if (!epf.enabled || wages <= 0) return { base: 0, employee: 0, employerEpf: 0, eps: 0, edli: 0, admin: 0 }
  const ceiling = pfCeilingFor(m, epf)
  const base = round(epf.restrictToCeiling ? Math.min(wages, ceiling) : wages)
  const employee = round((base * epf.employeeRate) / 100)
  const employerTotal = round((base * epf.employerRate) / 100)
  // EPS is always on wages up to the ceiling, even when PF is paid on more.
  const eps = Math.min(round((Math.min(base, ceiling) * epf.epsRate) / 100), employerTotal)
  const capped = Math.min(base, ceiling)
  return {
    base,
    employee,
    employerEpf: employerTotal - eps,
    eps,
    edli: round((capped * epf.edliRate) / 100),
    admin: round((base * epf.adminRate) / 100),
  }
}

// ---- ESI -----------------------------------------------------------------------------------------

/** ESIC rounds each share UP to the next rupee. */
export function esiFor(gross, eligible, esi = DEFAULT_PAYROLL_SETTINGS.esi) {
  if (!esi.enabled || !eligible || gross <= 0) return { employee: 0, employer: 0 }
  return {
    employee: Math.ceil(round2((gross * esi.employeeRate) / 100)),
    employer: Math.ceil(round2((gross * esi.employerRate) / 100)),
  }
}

/** Whether a monthly gross falls under ESI (checked at the start of a contribution period). */
export const esiEligibleGross = (monthlyGross, esi = DEFAULT_PAYROLL_SETTINGS.esi) =>
  esi.enabled && monthlyGross > 0 && monthlyGross <= esi.grossCeiling

// ---- LWF -----------------------------------------------------------------------------------------

export function lwfFor(m, enabledForEmployee, lwf = DEFAULT_PAYROLL_SETTINGS.lwf) {
  const mo = Number(monthKey(m).slice(5, 7))
  if (!lwf.enabled || !enabledForEmployee || !(lwf.months || []).includes(mo)) return { employee: 0, employer: 0 }
  return { employee: round2(lwf.employee), employer: round2(lwf.employer) }
}

// ---- income tax ---------------------------------------------------------------------------------

export const TAX_REGIMES = {
  // FY 2026-27 (Income-tax Act 2025; Budget 2026 left these unchanged).
  new: {
    standardDeduction: 75000,
    slabs: [
      [400000, 0],
      [800000, 5],
      [1200000, 10],
      [1600000, 15],
      [2000000, 20],
      [2400000, 25],
      [Infinity, 30],
    ],
    rebateLimit: 1200000,
    rebateMax: 60000,
  },
  old: {
    standardDeduction: 50000,
    slabs: [
      [250000, 0],
      [500000, 5],
      [1000000, 20],
      [Infinity, 30],
    ],
    rebateLimit: 500000,
    rebateMax: 12500,
  },
}

/** Tax on a year's taxable income: slabs, then the rebate with marginal relief, then 4% cess. */
export function annualTax(taxable, regime = "new") {
  const r = TAX_REGIMES[regime] || TAX_REGIMES.new
  const income = Math.max(0, round(taxable))
  let tax = 0
  let lower = 0
  for (const [upper, rate] of r.slabs) {
    if (income > lower) tax += ((Math.min(income, upper) - lower) * rate) / 100
    lower = upper
  }
  if (income <= r.rebateLimit) tax = Math.max(0, tax - r.rebateMax)
  // Marginal relief: just above the limit, tax may not exceed the income over it.
  else tax = Math.min(tax, income - r.rebateLimit)
  return round(tax * 1.04)
}

/**
 * This month's TDS. `ytd` is what the financial year has paid so far (before
 * this month): taxable gross and TDS. The rest of the year is projected at the
 * current structure. `deductions` are the regime's other deductions for the
 * year (old regime: 80C etc.; new regime: normally 0).
 */
export function monthlyTds({ month, regime = "new", taxableThisMonth, projectedMonthlyTaxable, ytd = {}, deductions = 0 }) {
  const left = monthsLeftInFy(month)
  const annualGross = round2((ytd.taxable || 0) + taxableThisMonth + projectedMonthlyTaxable * (left - 1))
  const r = TAX_REGIMES[regime] || TAX_REGIMES.new
  const taxable = Math.max(0, annualGross - r.standardDeduction - (deductions || 0))
  const tax = annualTax(taxable, regime)
  const monthly = Math.max(0, round((tax - (ytd.tds || 0)) / left))
  return { annualGross, taxable, annualTax: tax, monthly }
}

// ---- the salary structure (CTC → monthly components) ----------------------------------------------

/**
 * Split an annual CTC with a template into monthly components. The balance
 * component takes what is left of the monthly CTC after the other earnings and,
 * when the setting says so, the employer's PF; that PF depends on the balance
 * itself (it counts as wages), so it is solved by a short fixed-point loop.
 */
export function structureFromCtc({ annualCtc, template, month, settings = DEFAULT_PAYROLL_SETTINGS, pfEnabled = true }) {
  const ctc = round2((Number(annualCtc) || 0) / 12)
  const items = template && template.length ? template : DEFAULT_COMPONENTS
  const basicDef = items.find((c) => c.code === "BASIC")
  const basic = basicDef ? amountFor(basicDef, { ctc, basic: 0 }) : 0
  const fixed = items
    .filter((c) => c.kind === "earning" && c.calc !== "balance")
    .map((c) => ({ ...c, amount: c.code === "BASIC" ? basic : amountFor(c, { ctc, basic }) }))
  const balanceDef = items.find((c) => c.kind === "earning" && c.calc === "balance")
  const epf = settings.epf || DEFAULT_PAYROLL_SETTINGS.epf
  const inCtc = pfEnabled && epf.enabled && epf.includeEmployerInCtc

  let balance = Math.max(0, round2(ctc - sum(fixed.map((c) => c.amount))))
  let employerPf = 0
  for (let i = 0; i < 6 && inCtc; i++) {
    const earnings = balanceDef ? [...fixed, { ...balanceDef, amount: balance }] : fixed
    const { wages } = codeWages(earnings)
    const pf = epfFor(wages, month, epf)
    employerPf = pf.employerEpf + pf.eps
    const next = Math.max(0, round2(ctc - sum(fixed.map((c) => c.amount)) - employerPf))
    if (Math.abs(next - balance) < 0.5) {
      balance = next
      break
    }
    balance = next
  }
  const earnings = (balanceDef ? [...fixed, { ...balanceDef, amount: round(balance) }] : fixed).map((c) => ({
    code: c.code,
    name: c.name,
    kind: "earning",
    amount: round(c.amount),
    taxable: c.taxable !== false,
    in_wages: Boolean(c.in_wages),
  }))
  const gross = sum(earnings.map((e) => e.amount))
  return { monthlyCtc: ctc, earnings, gross, employerPfInCtc: inCtc ? round(employerPf) : 0 }
}

function amountFor(c, { ctc, basic }) {
  const v = Number(c.value) || 0
  if (c.calc === "pct_ctc") return round2((ctc * v) / 100)
  if (c.calc === "pct_basic") return round2((basic * v) / 100)
  if (c.calc === "flat") return round2(v)
  return 0
}

// ---- one month's payslip ----------------------------------------------------------------------------

/**
 * The payslip for one person for one month.
 *
 * `structure.earnings` are the FULL-month amounts; `paidDays` of `basisDays`
 * are paid. `oneTime` are extra earnings (bonus, incentive, arrears) and
 * deductions (recoveries); `reimbursements` are paid outside wages and tax;
 * `loans` are recovered by instalment. `employee` says whether PF / ESI / LWF
 * apply and which tax regime. `ytd` is the financial year so far.
 */
export function computePayslip({
  month,
  structure,
  paidDays,
  basisDays,
  oneTime = [],
  reimbursements = [],
  loans = [],
  employee = {},
  settings = DEFAULT_PAYROLL_SETTINGS,
  ytd = {},
  taxDeductions = 0,
}) {
  const basis = Math.max(1, Number(basisDays) || daysInMonth(month))
  const paid = Math.min(basis, Math.max(0, Number(paidDays) || 0))
  const factor = paid / basis

  const regular = (structure.earnings || []).map((e) => ({ ...e, full: e.amount, amount: round(e.amount * factor) }))
  const extraEarnings = oneTime
    .filter((o) => o.kind === "earning" && Number(o.amount) > 0)
    .map((o) => ({
      code: o.code || "ONE_TIME",
      name: o.name,
      kind: "earning",
      amount: round(o.amount),
      taxable: o.taxable !== false,
      in_wages: false,
      oneTime: true,
    }))
  const earnings = [...regular, ...extraEarnings]
  const gross = sum(earnings.map((e) => e.amount))
  const regularGross = sum(regular.map((e) => e.amount))

  // PF on the Code-on-Wages "wages" of the regular pay (bonus and other
  // one-time items are outside wages).
  const { wages } = codeWages(regular)
  const pf = employee.pf === false ? epfFor(0, month, settings.epf) : epfFor(wages, month, settings.epf)
  const esi = esiFor(gross, Boolean(employee.esi), settings.esi)
  const lwf = lwfFor(month, employee.lwf !== false, settings.lwf)

  const taxableThisMonth = sum(earnings.filter((e) => e.taxable !== false).map((e) => e.amount))
  const projectedMonthlyTaxable = sum((structure.earnings || []).filter((e) => e.taxable !== false).map((e) => e.amount))
  const regime = employee.regime || settings.tds?.defaultRegime || "new"
  const tds =
    settings.tds?.enabled === false || employee.tds === false
      ? { monthly: 0, annualTax: 0, taxable: 0, annualGross: 0 }
      : monthlyTds({ month, regime, taxableThisMonth, projectedMonthlyTaxable, ytd, deductions: taxDeductions })

  // Deductions, the statutory ones first: they are never deferred.
  const statutory = [
    pf.employee ? { code: "EPF", name: "EPF (employee)", amount: pf.employee, statutory: true } : null,
    esi.employee ? { code: "ESI", name: "ESI (employee)", amount: esi.employee, statutory: true } : null,
    lwf.employee ? { code: "LWF", name: "Labour welfare fund", amount: lwf.employee, statutory: true } : null,
    tds.monthly ? { code: "TDS", name: "Income tax (TDS)", amount: tds.monthly, statutory: true } : null,
  ].filter(Boolean)

  const wanted = [
    ...oneTime
      .filter((o) => o.kind === "deduction" && Number(o.amount) > 0)
      .map((o) => ({ code: o.code || "RECOVERY", name: o.name, amount: round(o.amount), oneTime: true })),
    ...loans
      .filter((l) => Number(l.balance) > 0 && Number(l.instalment) > 0)
      .map((l) => ({
        code: "LOAN",
        name: l.name || "Loan recovery",
        loanId: l.id,
        amount: round(Math.min(Number(l.instalment), Number(l.balance))),
      })),
  ]

  // The 50% cap (Code on Wages s.18): what does not fit is carried forward.
  const cap = round2((gross * (settings.deductionCapPct ?? 50)) / 100)
  let room = round2(cap - sum(statutory.map((d) => d.amount)))
  const other = []
  const carried = []
  for (const d of wanted) {
    const take = Math.max(0, Math.min(d.amount, round(room)))
    if (take > 0) other.push({ ...d, amount: take })
    if (take < d.amount) carried.push({ ...d, amount: d.amount - take })
    room = round2(room - take)
  }

  const deductions = [...statutory, ...other]
  const totalDeductions = sum(deductions.map((d) => d.amount))
  const reimbursed = reimbursements
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({ code: "REIMB", name: r.name, amount: round2(r.amount), claimId: r.id }))
  const reimbursementTotal = sum(reimbursed.map((r) => r.amount))

  const employer = [
    pf.employerEpf ? { code: "ER_EPF", name: "EPF (employer)", amount: pf.employerEpf } : null,
    pf.eps ? { code: "ER_EPS", name: "Pension (EPS)", amount: pf.eps } : null,
    pf.edli ? { code: "ER_EDLI", name: "EDLI", amount: pf.edli } : null,
    pf.admin ? { code: "ER_ADMIN", name: "EPF admin charges", amount: pf.admin } : null,
    esi.employer ? { code: "ER_ESI", name: "ESI (employer)", amount: esi.employer } : null,
    lwf.employer ? { code: "ER_LWF", name: "Labour welfare fund (employer)", amount: lwf.employer } : null,
  ].filter(Boolean)
  const employerTotal = sum(employer.map((e) => e.amount))

  return {
    month: monthKey(month),
    paidDays: round2(paid),
    basisDays: basis,
    lopDays: round2(basis - paid),
    earnings,
    gross,
    regularGross,
    wages,
    deductions,
    carried,
    totalDeductions,
    reimbursements: reimbursed,
    reimbursementTotal,
    netPay: round2(gross + reimbursementTotal - totalDeductions),
    employer,
    employerTotal,
    costToCompany: round2(gross + employerTotal + reimbursementTotal),
    pf,
    pfCeiling: pfCeilingFor(month, settings.epf),
    esi,
    lwf,
    tds: { ...tds, regime },
  }
}

/**
 * Arrears for a back-dated revision (Zoho's "Effective From" before the
 * "Payout Month"): for every month already paid since the revision took
 * effect, the new full-month gross scaled by that month's paid days, less the
 * regular gross that was actually paid. One line per month, so the payslip can
 * say where the figure came from.
 */
/** How a payslip line is matched across months for its YTD figure. */
export const lineKey = (x) => `${x.code || ""}|${x.name || ""}`

/**
 * Year-to-date per line, as Zoho prints it beside each amount: this payslip
 * plus every paid payslip earlier in the same financial year (`prior` is their
 * `data`). Keyed by lineKey so a component keeps its total across months.
 */
export function ytdLines(prior, slip) {
  const sum = (side) => {
    const out = {}
    for (const d of [...(prior || []), slip]) {
      for (const x of d?.[side] || []) out[lineKey(x)] = round2((out[lineKey(x)] || 0) + (Number(x.amount) || 0))
    }
    return out
  }
  return { earnings: sum("earnings"), deductions: sum("deductions") }
}

export function arrearsFor({ effectiveFrom, payoutMonth, newGross, paidSlips }) {
  const from = monthKey(effectiveFrom)
  const to = monthKey(payoutMonth)
  const lines = (paidSlips || [])
    .filter((s) => s.month >= from && s.month < to && s.status !== "skipped")
    .map((s) => {
      const due = round((newGross * (Number(s.paidDays) || 0)) / Math.max(1, Number(s.basisDays) || 1))
      return { month: s.month, amount: Math.max(0, due - round(s.regularGross || 0)) }
    })
    .filter((l) => l.amount > 0)
  return { lines, total: sum(lines.map((l) => l.amount)) }
}

/** Paid days from attendance: payable days, clamped to the part of the month the person was employed. */
export function paidDaysFor({ month, payable, doj, exitDate, basis = "actual", fixedDays = 26 }) {
  const first = monthKey(month)
  const dim = daysInMonth(month)
  const last = `${first.slice(0, 8)}${String(dim).padStart(2, "0")}`
  const from = doj && doj > first ? doj : first
  const to = exitDate && exitDate < last ? exitDate : last
  const employedDays = from > to ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  const basisDays = basis === "fixed" ? fixedDays : dim
  // Payable days only exist while employed.
  const payableEmployed = Math.min(Number(payable) || 0, employedDays)
  if (basis !== "fixed") {
    return { basisDays, employedDays, paidDays: round2(Math.min(payableEmployed, basisDays)) }
  }
  // A fixed basis (Zoho's "organisation working days"): the fixed days, scaled
  // to the part of the month the person was employed, less the days they were
  // employed and not payable. A full month with no loss of pay is the full 26.
  const lop = employedDays - payableEmployed
  const base = (basisDays * employedDays) / dim
  return { basisDays, employedDays, paidDays: round2(Math.max(0, Math.min(basisDays, base - lop))) }
}

// ---- the run's totals and the month-on-month check ----------------------------------------------------

export function runTotals(payslips) {
  const inc = payslips.filter((p) => p.status !== "skipped")
  return {
    employees: inc.length,
    gross: sum(inc.map((p) => p.gross)),
    deductions: sum(inc.map((p) => p.totalDeductions)),
    netPay: sum(inc.map((p) => p.netPay)),
    employer: sum(inc.map((p) => p.employerTotal)),
    reimbursements: sum(inc.map((p) => p.reimbursementTotal)),
    payrollCost: sum(inc.map((p) => p.costToCompany)),
    tds: sum(inc.map((p) => p.tds?.monthly || 0)),
    epf: sum(inc.map((p) => (p.pf?.employee || 0) + (p.pf?.employerEpf || 0) + (p.pf?.eps || 0))),
    esi: sum(inc.map((p) => (p.esi?.employee || 0) + (p.esi?.employer || 0))),
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

// ---- files for the bank, EPFO and ESIC --------------------------------------------------------------------

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

/** EPFO ECR v2: one line per member, 11 fields joined by #~#, no header. */
export function ecrLines(payslips, employees) {
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  return payslips
    .filter((p) => p.status === "included" && (p.pf?.employee || 0) > 0)
    .map((p) => {
      const e = byUser.get(p.user_id) || {}
      const epsWages = round(Math.min(p.pf.base, p.pfCeiling || p.pf.base))
      return [
        e.uan || "",
        String(e.name || "").toUpperCase(),
        round(p.gross),
        round(p.pf.base),
        epsWages,
        epsWages,
        round(p.pf.employee),
        round(p.pf.eps),
        round(p.pf.employerEpf),
        Math.max(0, round(p.lopDays)),
        0,
      ].join("#~#")
    })
}

/** ESIC monthly upload rows (the portal wants every cell as text). */
export function esicRows(payslips, employees) {
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  const header = ["IP Number", "IP Name", "No of Days for which wages paid", "Total Monthly Wages", "Reason Code for Zero workings days", "Last Working Day"]
  const rows = payslips
    .filter((p) => p.status === "included" && (p.esi?.employee || 0) + (p.esi?.employer || 0) > 0)
    .map((p) => {
      const e = byUser.get(p.user_id) || {}
      return [String(e.esi_ip || ""), String(e.name || ""), String(round(p.paidDays)), String(round(p.gross)), round(p.paidDays) === 0 ? "1" : "", ""]
    })
  return [header, ...rows]
}

/** The salary register (Form IV style): one row per person, every component a column. */
export function registerRows(payslips, employees) {
  const byUser = new Map(employees.map((e) => [e.user_id, e]))
  const earnCodes = []
  const dedCodes = []
  for (const p of payslips) {
    for (const e of p.earnings || []) if (!earnCodes.some((c) => c.code === e.code)) earnCodes.push({ code: e.code, name: e.name })
    for (const d of p.deductions || []) if (!dedCodes.some((c) => c.code === d.code)) dedCodes.push({ code: d.code, name: d.name })
  }
  const header = [
    "Employee code",
    "Name",
    "Designation",
    "Paid days",
    "LOP days",
    ...earnCodes.map((c) => c.name),
    "Gross",
    ...dedCodes.map((c) => c.name),
    "Total deductions",
    "Reimbursements",
    "Net pay",
    "Employer EPF+EPS",
    "Employer ESI",
    "Status",
  ]
  const val = (list, code) => sum((list || []).filter((x) => x.code === code).map((x) => x.amount))
  const rows = payslips.map((p) => {
    const e = byUser.get(p.user_id) || {}
    return [
      e.employee_code || "",
      e.name || "",
      e.designation || "",
      p.paidDays,
      p.lopDays,
      ...earnCodes.map((c) => val(p.earnings, c.code)),
      p.gross,
      ...dedCodes.map((c) => val(p.deductions, c.code)),
      p.totalDeductions,
      p.reimbursementTotal,
      p.netPay,
      round2((p.pf?.employerEpf || 0) + (p.pf?.eps || 0)),
      p.esi?.employer || 0,
      p.status || "included",
    ]
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
