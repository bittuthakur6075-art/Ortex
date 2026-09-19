import { describe, expect, it } from "vitest"
import {
  annualTax,
  arrearsFor,
  bankFileRows,
  codeWages,
  computePayslip,
  daysInMonth,
  DEFAULT_PAYROLL_SETTINGS,
  ecrLines,
  epfFor,
  esiFor,
  esicRows,
  fyOf,
  lwfFor,
  monthlyTds,
  monthsLeftInFy,
  paidDaysFor,
  pfCeilingFor,
  registerRows,
  rupeesInWords,
  runTotals,
  structureFromCtc,
  varianceFlags,
} from "./payroll"

const S = DEFAULT_PAYROLL_SETTINGS
const withCeiling25k = { ...S, epf: { ...S.epf, ceilings: [...S.epf.ceilings, { from: "2026-10-01", amount: 25000 }] } }

describe("calendar", () => {
  it("financial year and months left", () => {
    expect(fyOf("2026-09-01")).toEqual({ start: "2026-04-01", end: "2027-03-31", label: "2026-27" })
    expect(fyOf("2027-02-01").label).toBe("2026-27")
    expect(monthsLeftInFy("2026-04-01")).toBe(12)
    expect(monthsLeftInFy("2026-09-01")).toBe(7)
    expect(monthsLeftInFy("2027-03-01")).toBe(1)
    expect(daysInMonth("2028-02-01")).toBe(29)
  })

  it("the PF ceiling is dated", () => {
    expect(pfCeilingFor("2026-09-01", S.epf)).toBe(15000)
    expect(pfCeilingFor("2026-09-01", withCeiling25k.epf)).toBe(15000)
    expect(pfCeilingFor("2026-10-01", withCeiling25k.epf)).toBe(25000)
  })
})

describe("Code on Wages", () => {
  it("adds back excluded pay above half the remuneration", () => {
    // Basic 10k in wages, HRA + conveyance 15k excluded: 5k over half comes back.
    const w = codeWages([
      { amount: 10000, in_wages: true },
      { amount: 12000, in_wages: false },
      { amount: 3000, in_wages: false },
    ])
    expect(w.total).toBe(25000)
    expect(w.addBack).toBe(2500)
    expect(w.wages).toBe(12500)
  })
  it("adds nothing back when wages are already half", () => {
    expect(codeWages([{ amount: 15000, in_wages: true }, { amount: 5000, in_wages: false }]).wages).toBe(15000)
  })
})

describe("EPF / ESI / LWF", () => {
  it("EPF restricted to the ceiling, EPS at 8.33% of it", () => {
    const pf = epfFor(30000, "2026-09-01", S.epf)
    expect(pf.base).toBe(15000)
    expect(pf.employee).toBe(1800)
    expect(pf.eps).toBe(1250)
    expect(pf.employerEpf).toBe(550)
    expect(pf.edli).toBe(75)
    expect(pf.admin).toBe(75)
  })
  it("EPF on actual wages when not restricted, EPS still capped", () => {
    const pf = epfFor(30000, "2026-09-01", { ...S.epf, restrictToCeiling: false })
    expect(pf.employee).toBe(3600)
    expect(pf.eps).toBe(1250)
    expect(pf.employerEpf).toBe(2350)
  })
  it("EPF under the new ceiling from its date", () => {
    const pf = epfFor(30000, "2026-10-01", withCeiling25k.epf)
    expect(pf.employee).toBe(3000)
    expect(pf.eps).toBe(2083)
  })
  it("ESI rounds each share up", () => {
    expect(esiFor(18456, true)).toEqual({ employee: 139, employer: 600 })
    expect(esiFor(18456, false)).toEqual({ employee: 0, employer: 0 })
  })
  it("Delhi LWF only in June and December", () => {
    expect(lwfFor("2026-06-01", true)).toEqual({ employee: 0.75, employer: 2.25 })
    expect(lwfFor("2026-09-01", true)).toEqual({ employee: 0, employer: 0 })
  })
})

describe("income tax, FY 2026-27", () => {
  it("nothing up to ₹12 lakh taxable under the new regime (s.87A)", () => {
    expect(annualTax(1200000, "new")).toBe(0)
  })
  it("marginal relief just above ₹12 lakh", () => {
    // Slab tax on 12.1L is 61,500; relief caps it at the 10,000 over the limit, plus cess.
    expect(annualTax(1210000, "new")).toBe(10400)
  })
  it("slab tax at ₹20 lakh", () => {
    // 0 + 20k + 40k + 60k + 80k = 2,00,000 + 4% cess.
    expect(annualTax(2000000, "new")).toBe(208000)
  })
  it("old regime", () => {
    expect(annualTax(500000, "old")).toBe(0)
    // 12,500 + 1,00,000 + 30% of 2,00,000 = 1,72,500 + cess.
    expect(annualTax(1200000, "old")).toBe(179400)
  })
  it("monthly TDS spreads the year's tax over the months left", () => {
    // 1.5L a month all year: 18L gross, 17.25L taxable.
    const t = monthlyTds({ month: "2026-04-01", taxableThisMonth: 150000, projectedMonthlyTaxable: 150000 })
    expect(t.taxable).toBe(1725000)
    expect(t.annualTax).toBe(annualTax(1725000, "new"))
    expect(t.monthly).toBe(Math.round(t.annualTax / 12))
    // Halfway, with tax already deducted, only the rest is spread.
    const later = monthlyTds({
      month: "2026-10-01",
      taxableThisMonth: 150000,
      projectedMonthlyTaxable: 150000,
      ytd: { taxable: 900000, tds: t.monthly * 6 },
    })
    expect(later.monthly).toBe(Math.round((t.annualTax - t.monthly * 6) / 6))
  })
  it("no TDS for a salary under the rebate", () => {
    expect(monthlyTds({ month: "2026-04-01", taxableThisMonth: 50000, projectedMonthlyTaxable: 50000 }).monthly).toBe(0)
  })
})

describe("salary structure from CTC", () => {
  it("fixed allowance balances the CTC after the employer PF", () => {
    const s = structureFromCtc({ annualCtc: 360000, month: "2026-09-01" })
    // 30,000 a month: Basic 15,000, HRA 6,000, conveyance 1,600, employer PF 1,800 on the capped 15k.
    const by = Object.fromEntries(s.earnings.map((e) => [e.code, e.amount]))
    expect(by.BASIC).toBe(15000)
    expect(by.HRA).toBe(6000)
    expect(by.CONV).toBe(1600)
    expect(s.employerPfInCtc).toBe(1800)
    expect(by.FIXED).toBe(30000 - 15000 - 6000 - 1600 - 1800)
    expect(s.gross + s.employerPfInCtc).toBe(30000)
  })
  it("a low CTC still sums exactly", () => {
    const s = structureFromCtc({ annualCtc: 240000, month: "2026-09-01" })
    expect(s.gross + s.employerPfInCtc).toBe(20000)
  })
})

describe("one month's payslip", () => {
  const structure = structureFromCtc({ annualCtc: 360000, month: "2026-09-01" })

  it("a full month", () => {
    const p = computePayslip({ month: "2026-09-01", structure, paidDays: 30, basisDays: 30, employee: { esi: false } })
    expect(p.gross).toBe(structure.gross)
    expect(p.pf.employee).toBe(1800)
    expect(p.deductions.map((d) => d.code)).toEqual(["EPF"])
    expect(p.netPay).toBe(p.gross - 1800)
    expect(p.costToCompany).toBe(p.gross + p.employerTotal)
  })

  it("loss of pay pro-rates every regular component", () => {
    const p = computePayslip({ month: "2026-09-01", structure, paidDays: 27, basisDays: 30, employee: { esi: false } })
    expect(p.lopDays).toBe(3)
    const basic = p.earnings.find((e) => e.code === "BASIC")
    expect(basic.amount).toBe(13500)
    expect(p.gross).toBe(Math.round(structure.earnings.reduce((s, e) => s + Math.round(e.amount * 0.9), 0)))
  })

  it("one-time earnings are taxable pay but not PF wages; reimbursements are neither", () => {
    const p = computePayslip({
      month: "2026-09-01",
      structure,
      paidDays: 30,
      basisDays: 30,
      oneTime: [{ kind: "earning", name: "Festival bonus", amount: 5000 }],
      reimbursements: [{ id: "r1", name: "Fuel", amount: 1200 }],
      employee: { esi: false },
    })
    expect(p.gross).toBe(structure.gross + 5000)
    expect(p.pf.employee).toBe(1800)
    expect(p.reimbursementTotal).toBe(1200)
    expect(p.netPay).toBe(p.gross + 1200 - p.totalDeductions)
  })

  it("the 50% cap defers a loan instalment, never a statutory deduction", () => {
    const small = structureFromCtc({ annualCtc: 120000, month: "2026-09-01" })
    const p = computePayslip({
      month: "2026-09-01",
      structure: small,
      paidDays: 30,
      basisDays: 30,
      loans: [{ id: "L1", instalment: 20000, balance: 50000 }],
      employee: { esi: true },
    })
    const cap = p.gross / 2
    expect(p.totalDeductions).toBeLessThanOrEqual(Math.ceil(cap))
    expect(p.deductions.find((d) => d.code === "EPF")).toBeTruthy()
    expect(p.carried[0].code).toBe("LOAN")
    expect(p.carried[0].amount + (p.deductions.find((d) => d.code === "LOAN")?.amount || 0)).toBe(20000)
  })

  it("ESI and LWF when they apply", () => {
    const low = structureFromCtc({ annualCtc: 216000, month: "2026-12-01" })
    const p = computePayslip({ month: "2026-12-01", structure: low, paidDays: 31, basisDays: 31, employee: { esi: true } })
    expect(p.esi.employee).toBe(Math.ceil(p.gross * 0.0075))
    expect(p.lwf.employee).toBe(0.75)
    expect(p.netPay % 1).not.toBe(0)
  })
})

describe("paid days", () => {
  it("a full month on actual days", () => {
    expect(paidDaysFor({ month: "2026-09-01", payable: 30 })).toEqual({ basisDays: 30, employedDays: 30, paidDays: 30 })
  })
  it("a joiner is paid only from their joining date", () => {
    expect(paidDaysFor({ month: "2026-09-01", payable: 30, doj: "2026-09-16" }).paidDays).toBe(15)
  })
  it("a fixed 26-day basis scales", () => {
    const r = paidDaysFor({ month: "2026-09-01", payable: 30, basis: "fixed", fixedDays: 26 })
    expect(r.basisDays).toBe(26)
    expect(r.paidDays).toBe(26)
  })
})

describe("arrears", () => {
  it("pays the difference for months already paid at the old rate", () => {
    const a = arrearsFor({
      effectiveFrom: "2026-07-01",
      payoutMonth: "2026-09-01",
      newGross: 33000,
      paidSlips: [
        { month: "2026-07-01", paidDays: 31, basisDays: 31, regularGross: 30000 },
        { month: "2026-08-01", paidDays: 29, basisDays: 31, regularGross: Math.round((30000 * 29) / 31) },
        { month: "2026-06-01", paidDays: 30, basisDays: 30, regularGross: 30000 },
      ],
    })
    expect(a.lines.map((l) => l.month)).toEqual(["2026-07-01", "2026-08-01"])
    expect(a.total).toBe(3000 + (Math.round((33000 * 29) / 31) - Math.round((30000 * 29) / 31)))
  })
})

describe("run totals, variance and files", () => {
  const structure = structureFromCtc({ annualCtc: 360000, month: "2026-09-01" })
  const slip = (user_id, over = {}) => ({
    user_id,
    status: "included",
    ...computePayslip({ month: "2026-09-01", structure, paidDays: 30, basisDays: 30, employee: { esi: false } }),
    ...over,
  })
  const employees = [
    { user_id: "a", name: "Asha Rao", uan: "100200300400", account_number: "123456", ifsc: "HDFC0001234", employee_code: "E1", designation: "Accounts" },
    { user_id: "b", name: "Ravi Kumar", uan: "100200300401", account_number: "654321", ifsc: "ICIC0004321", employee_code: "E2", esi_ip: "1234567890" },
  ]

  it("totals skip the skipped", () => {
    const t = runTotals([slip("a"), slip("b", { status: "skipped" })])
    expect(t.employees).toBe(1)
    expect(t.netPay).toBe(slip("a").netPay)
  })

  it("flags big changes and people who came and went", () => {
    const now = [slip("a"), slip("c")]
    const before = [slip("a", { netPay: slip("a").netPay * 0.8 }), slip("b")]
    const f = varianceFlags(now, before)
    expect(f.map((x) => `${x.user_id}:${x.kind}`).sort()).toEqual(["a:up", "b:gone", "c:new"])
  })

  it("ECR lines have 11 #~# fields", () => {
    const lines = ecrLines([slip("a")], employees)
    expect(lines).toHaveLength(1)
    const f = lines[0].split("#~#")
    expect(f).toHaveLength(11)
    expect(f[0]).toBe("100200300400")
    expect(f[1]).toBe("ASHA RAO")
    expect(f[6]).toBe("1800")
    expect(f[7]).toBe("1250")
    expect(f[8]).toBe("550")
  })

  it("bank file, ESIC rows and the register", () => {
    const bank = bankFileRows([slip("a"), slip("b", { status: "withheld" })], employees, { debitAccount: "999" })
    expect(bank).toHaveLength(2)
    expect(bank[1]).toContain("123456")
    const esic = esicRows([slip("b", { esi: { employee: 100, employer: 400 } })], employees)
    expect(esic[1][0]).toBe("1234567890")
    const reg = registerRows([slip("a")], employees)
    expect(reg[0]).toContain("Basic")
    expect(reg[1][0]).toBe("E1")
  })

  it("amounts in words", () => {
    expect(rupeesInWords(123456)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only")
    expect(rupeesInWords(0)).toBe("Rupees Zero Only")
  })
})
