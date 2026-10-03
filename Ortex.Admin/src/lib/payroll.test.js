import { describe, expect, it } from "vitest"
import {
  bankFileRows,
  computePayslip,
  dayRateOf,
  daysInMonth,
  daysWorkedFrom,
  fyOf,
  instalmentFor,
  overtimeItem,
  overtimeMinutes,
  paidDaysFor,
  payableFrom,
  payTermsOf,
  recoveryFor,
  revisionRow,
  rupeesInWords,
  runTotals,
  shiftMinutes,
  varianceFlags,
  ytdLines,
} from "./payroll"

const SEP = "2026-09-01"
const monthly = { type: "monthly", rate: 27000 }
const daily = { type: "daily", rate: 800 }
const STATUTORY = /EPF|ESI|LWF|TDS|PT|Income tax|Provident|Labour welfare|ER_/i
const codesOf = (slip) => [...slip.earnings, ...slip.deductions].map((x) => `${x.code} ${x.name}`)

describe("calendar", () => {
  it("days in the month and the financial year", () => {
    expect(daysInMonth("2026-02-01")).toBe(28)
    expect(daysInMonth(SEP)).toBe(30)
    expect(fyOf(SEP).label).toBe("2026-27")
    expect(fyOf("2027-03-01").label).toBe("2026-27")
  })
})

describe("pay terms", () => {
  it("a new revision carries its pay type and rate", () => {
    expect(payTermsOf({ ...revisionRow({ type: "monthly", rate: 27000 }) })).toEqual(monthly)
    expect(payTermsOf({ ...revisionRow({ type: "daily", rate: 800 }) })).toEqual(daily)
    expect(revisionRow({ type: "daily", rate: 800 })).toMatchObject({ pay_type: "daily", daily_rate: 800, monthly_gross: 0, earnings: [] })
    expect(revisionRow({ type: "monthly", rate: 27000 })).toMatchObject({ pay_type: "monthly", monthly_gross: 27000, annual_ctc: 324000 })
  })
  it("an old revision (no pay type) is monthly at the sum of its components", () => {
    const old = {
      annual_ctc: 360000,
      monthly_gross: 28200,
      earnings: [
        { code: "BASIC", amount: 15000 },
        { code: "HRA", amount: 6000 },
        { code: "CONV", amount: 1600 },
        { code: "FIXED", amount: 5600 },
      ],
    }
    expect(payTermsOf(old)).toEqual({ type: "monthly", rate: 28200 })
    expect(payTermsOf({ monthly_gross: 20000, earnings: [] })).toEqual({ type: "monthly", rate: 20000 })
    expect(payTermsOf(null)).toBeNull()
  })
})

describe("monthly salary", () => {
  it("pays salary x paid days / basis days (actual days)", () => {
    const s = computePayslip({ month: SEP, terms: monthly, paidDays: 26, basisDays: 30 })
    expect(s.gross).toBe(23400)
    expect(s.earnings[0]).toMatchObject({ code: "SALARY", amount: 23400, note: "₹27,000, paid days 26 of 30" })
    expect(s).toMatchObject({ payType: "monthly", rate: 27000, paidDays: 26, basisDays: 30, lopDays: 4, netPay: 23400 })
  })
  it("a fixed 26-day basis", () => {
    const pd = paidDaysFor({ month: SEP, payable: 28, basis: "fixed", fixedDays: 26 })
    expect(pd).toMatchObject({ basisDays: 26, paidDays: 24 })
    expect(computePayslip({ month: SEP, terms: { type: "monthly", rate: 26000 }, paidDays: pd.paidDays, basisDays: 26 }).gross).toBe(24000)
  })
  it("paid days never exceed the basis", () => {
    expect(computePayslip({ month: SEP, terms: monthly, paidDays: 40, basisDays: 30 }).gross).toBe(27000)
  })
})

describe("daily wage", () => {
  const day = (d, status) => ({ day: `2026-09-${String(d).padStart(2, "0")}`, status })
  // 22 P, 2 HD, 1 OD, plus weekly offs, a holiday, leave, absences, a missed punch, loss of pay.
  const month = [
    ...Array.from({ length: 22 }, (_, i) => day(i + 1, "P")),
    day(23, "HD"),
    day(24, "HD"),
    day(25, "OD"),
    day(26, "WO"),
    day(27, "H"),
    day(28, "L"),
    day(29, "A"),
    day(30, "MP"),
    { day: "2026-09-30", status: "LOP" },
  ]

  it("counts P and OD as 1, HD as 0.5, and nothing else", () => {
    expect(daysWorkedFrom(month, { month: SEP })).toBe(24)
    expect(daysWorkedFrom([day(6, "WO"), day(7, "H"), day(8, "L"), day(9, "A"), day(10, "LOP"), day(11, "MP")], { month: SEP })).toBe(0)
  })
  it("pays days worked x the daily rate", () => {
    const s = computePayslip({ month: SEP, terms: daily, daysWorked: 24 })
    expect(s.gross).toBe(19200)
    expect(s.earnings[0]).toMatchObject({ code: "WAGES", name: "Daily wage", note: "days worked 24 x ₹800" })
    expect(s).toMatchObject({ payType: "daily", rate: 800, daysWorked: 24, netPay: 19200 })
    expect(s.paidDays).toBeUndefined()
  })
  it("counts only days inside the month and the employed span", () => {
    expect(daysWorkedFrom(month, { month: SEP, doj: "2026-09-21" })).toBe(4)
    expect(daysWorkedFrom(month, { month: SEP, exitDate: "2026-09-10" })).toBe(10)
    expect(daysWorkedFrom([{ day: "2026-10-01", status: "P" }], { month: SEP })).toBe(0)
  })
})

describe("paid days from attendance", () => {
  it("a full month on actual days", () => {
    expect(paidDaysFor({ month: SEP, payable: 30 })).toEqual({ basisDays: 30, employedDays: 30, paidDays: 30 })
  })
  it("a joiner is paid only from their joining date; a leaver up to the exit", () => {
    expect(paidDaysFor({ month: SEP, payable: 30, doj: "2026-09-16" }).paidDays).toBe(15)
    expect(paidDaysFor({ month: SEP, payable: 30, exitDate: "2026-09-10" }).paidDays).toBe(10)
  })
})

describe("payableFrom", () => {
  it("refuses the run when attendance could not be read", () => {
    expect(() => payableFrom({ rows: [], error: "permission denied" }, SEP)).toThrow(/could not be read.*permission denied/)
  })
  it("uses the summary, and marks a person with no row", () => {
    const get = payableFrom({ rows: [{ user_id: "a", payable: "24.5" }], error: null }, SEP)
    expect(get("a")).toEqual({ payable: 24.5, missing: false })
    expect(get("b")).toEqual({ payable: 30, missing: true })
  })
})

describe("overtime at the regular rate", () => {
  const rows = (...m) => m.map(([d, minutes]) => ({ day: d, minutes }))

  it("reads the full-day shift from attendance settings, 9h by default", () => {
    expect(shiftMinutes()).toBe(540)
    expect(shiftMinutes({ start: "09:00", end: "17:00" })).toBe(480)
    expect(shiftMinutes({ start: "22:00", end: "06:00" })).toBe(480)
  })

  it("monthly: one day's pay (salary / basis) over the shift's hours", () => {
    const minutes = overtimeMinutes(rows(["2026-09-05", 180], ["2026-09-06", 120]), { month: SEP })
    expect(minutes).toBe(300)
    const ot = overtimeItem({ minutes, dayRate: dayRateOf(monthly, 30), shiftMin: 540 })
    expect(ot).toMatchObject({ code: "OVERTIME", kind: "earning", amount: 500, note: "5h at ₹100/h" })
    expect(ot.data).toEqual({ minutes: 300, hours: 5, hourlyRate: 100, auto: true })
  })

  it("daily: the daily rate over the shift's hours", () => {
    const ot = overtimeItem({ minutes: 180, dayRate: dayRateOf(daily, 30), shiftMin: 540 })
    expect(ot.amount).toBe(267)
    expect(ot.data.hourlyRate).toBe(88.89)
    expect(ot.note).toBe("3h at ₹88.89/h")
  })

  it("a manual amount replaces the auto figure, and 0 pays nothing", () => {
    const base = { minutes: 330, dayRate: 900, shiftMin: 540 }
    expect(overtimeItem(base).amount).toBe(550)
    const manual = overtimeItem({ ...base, mode: "manual", amount: 400 })
    expect(manual).toMatchObject({ amount: 400, note: "5h 30m, amount entered" })
    expect(manual.data).toMatchObject({ minutes: 330, auto: false })
    expect(overtimeItem({ ...base, mode: "manual", amount: 0 })).toBeNull()
    expect(overtimeItem({ ...base, mode: "manual", amount: "" })).toBeNull()
    // Even with no overtime worked, payroll can pay an amount it typed.
    expect(overtimeItem({ ...base, minutes: 0, mode: "manual", amount: 250 }).amount).toBe(250)
  })

  it("nothing to pay, or an older draft's OVERTIME item, gives no line", () => {
    expect(overtimeItem({ minutes: 0, dayRate: 900 })).toBeNull()
    expect(overtimeItem({ minutes: 60, dayRate: 900, oneTime: [{ code: "OVERTIME", kind: "earning", amount: 50 }] })).toBeNull()
  })

  it("counts only days inside the month and the employed span", () => {
    const r = rows(["2026-09-02", 60], ["2026-09-10", 60], ["2026-09-20", 60], ["2026-10-01", 60])
    expect(overtimeMinutes(r, { month: SEP, doj: "2026-09-05", exitDate: "2026-09-15" })).toBe(60)
    expect(overtimeMinutes(r, { month: SEP })).toBe(180)
  })

  it("rides the slip as an earning", () => {
    const ot = overtimeItem({ minutes: 300, dayRate: 900, shiftMin: 540 })
    const s = computePayslip({ month: SEP, terms: monthly, paidDays: 26, basisDays: 30, oneTime: [ot] })
    expect(s.gross).toBe(23900)
    expect(s.earnings.find((e) => e.code === "OVERTIME")).toMatchObject({ amount: 500, note: "5h at ₹100/h", data: { auto: true } })
  })
})

describe("advances and one-time items", () => {
  const advance = { id: "L1", name: "Salary advance", amount: 9000, instalment: 3000, balance: 9000 }

  it("recovers the instalment and shows the balance after it", () => {
    const s = computePayslip({ month: SEP, terms: monthly, paidDays: 30, basisDays: 30, loans: [advance] })
    expect(s.deductions).toEqual([{ code: "LOAN", name: "Salary advance recovered", loanId: "L1", amount: 3000, balanceAfter: 6000, note: "balance ₹6,000" }])
    expect(s.netPay).toBe(24000)
  })

  it("payroll can change or skip this month's recovery", () => {
    const more = computePayslip({ month: SEP, terms: monthly, paidDays: 30, basisDays: 30, loans: [advance], recover: { L1: 5000 } })
    expect(more.deductions[0]).toMatchObject({ amount: 5000, balanceAfter: 4000 })
    const skip = computePayslip({ month: SEP, terms: monthly, paidDays: 30, basisDays: 30, loans: [advance], recover: { L1: 0 } })
    expect(skip.deductions).toEqual([])
    expect(skip.netPay).toBe(27000)
    expect(recoveryFor(advance, "")).toBe(3000)
    expect(recoveryFor(advance, 20000)).toBe(9000)
    expect(recoveryFor({ ...advance, balance: 1000 }, null)).toBe(1000)
  })

  it("instalments: in full, or spread over N months", () => {
    expect(instalmentFor(9000, 1)).toBe(9000)
    expect(instalmentFor(9000, 3)).toBe(3000)
    expect(instalmentFor(10000, 3)).toBe(3333.34)
  })

  it("one-time earnings and deductions", () => {
    const s = computePayslip({
      month: SEP,
      terms: daily,
      daysWorked: 24,
      oneTime: [
        { kind: "earning", code: "BONUS", name: "Bonus", amount: 2000 },
        { kind: "deduction", code: "RECOVERY", name: "Uniform", amount: 500 },
      ],
      loans: [advance],
    })
    expect(s.gross).toBe(21200)
    expect(s.totalDeductions).toBe(3500)
    expect(s.netPay).toBe(17700)
  })

  it("net pay never goes below zero: the rest of the advance carries forward", () => {
    const s = computePayslip({ month: SEP, terms: daily, daysWorked: 2, loans: [advance] })
    expect(s.gross).toBe(1600)
    expect(s.deductions[0]).toMatchObject({ amount: 1600, balanceAfter: 7400 })
    expect(s.carried).toEqual([{ code: "LOAN", name: "Salary advance recovered", amount: 1400, loanId: "L1" }])
    expect(s.netPay).toBe(0)
  })

  it("an off-cycle run pays only its one-time items", () => {
    const s = computePayslip({ month: SEP, terms: null, oneTime: [{ kind: "earning", code: "BONUS", name: "Diwali bonus", amount: 5000 }] })
    expect(s.earnings.map((e) => e.code)).toEqual(["BONUS"])
    expect(s.netPay).toBe(5000)
    expect(s.payType).toBeUndefined()
  })
})

describe("no statutory lines", () => {
  it("a slip carries no PF, ESI, LWF, PT, TDS or employer lines, whatever the pay", () => {
    for (const terms of [monthly, daily, { type: "monthly", rate: 250000 }, { type: "monthly", rate: 15000 }]) {
      const s = computePayslip({ month: "2026-12-01", terms, paidDays: 31, basisDays: 31, daysWorked: 26 })
      expect(codesOf(s).filter((c) => STATUTORY.test(c))).toEqual([])
      expect(s).not.toHaveProperty("employer")
      expect(s).not.toHaveProperty("tds")
      expect(s).not.toHaveProperty("pf")
      expect(s.totalDeductions).toBe(0)
    }
  })
})

describe("run totals, variance and the bank file", () => {
  const slip = (user_id, over = {}) => ({ user_id, status: "included", ...computePayslip({ month: SEP, terms: monthly, paidDays: 30, basisDays: 30 }), ...over })
  const employees = [
    { user_id: "a", name: "Asha Rao", account_number: "123456", ifsc: "HDFC0001234" },
    { user_id: "b", name: "Ravi Kumar", account_number: "654321", ifsc: "ICIC0004321" },
  ]

  it("totals skip the skipped", () => {
    const t = runTotals([slip("a"), slip("b", { status: "skipped" }), slip("c", { status: "withheld" })])
    expect(t).toEqual({ employees: 2, gross: 54000, deductions: 0, netPay: 54000, withheld: 1 })
  })

  it("flags big changes and people who came and went", () => {
    const now = [slip("a"), slip("c")]
    const before = [slip("a", { netPay: 27000 * 0.8 }), slip("b")]
    expect(varianceFlags(now, before).map((x) => `${x.user_id}:${x.kind}`).sort()).toEqual(["a:up", "b:gone", "c:new"])
  })

  it("the bank file pays included people only", () => {
    const bank = bankFileRows([slip("a"), slip("b", { status: "withheld" })], employees, { debitAccount: "999" })
    expect(bank).toHaveLength(2)
    expect(bank[1]).toContain("123456")
    expect(bank[1]).toContain("27000.00")
  })

  it("amounts in words", () => {
    expect(rupeesInWords(123456)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only")
    expect(rupeesInWords(0)).toBe("Rupees Zero Only")
  })
})

describe("ytdLines", () => {
  it("adds this payslip to the paid ones before it, line by line", () => {
    const prior = [{ earnings: [{ code: "SALARY", name: "Salary", amount: 27000 }], deductions: [] }, { earnings: [{ code: "SALARY", name: "Salary", amount: 26100 }, { code: "BONUS", name: "Bonus", amount: 2000 }], deductions: [] }]
    const y = ytdLines(prior, { earnings: [{ code: "SALARY", name: "Salary", amount: 27000 }], deductions: [{ code: "LOAN", name: "Salary advance recovered", amount: 3000 }] })
    expect(y.earnings["SALARY|Salary"]).toBe(80100)
    expect(y.earnings["BONUS|Bonus"]).toBe(2000)
    expect(y.deductions["LOAN|Salary advance recovered"]).toBe(3000)
  })
})
