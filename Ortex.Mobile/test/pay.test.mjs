// Payroll on the phone, the pure half: src/features/pay/payFormat.ts. fyOf and
// rupeesInWords are ports of Ortex.Admin/src/lib/payroll.js and are checked
// against it, so a payslip reads the same in words on both clients.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/payroll.js"))
const pay = await loadTs("features/pay/payFormat.ts")
const rows = await loadTs("features/pay/payRows.ts")

const slip = (id, month, { gross, net, tds = 0, other = 0, reimb = 0, released = `${month}T12:00:00Z` }) => ({
  id,
  run_id: `run-${id}`,
  status: "included",
  gross,
  net_pay: net,
  released_at: released,
  data: {
    month,
    gross,
    netPay: net,
    totalDeductions: tds + other,
    reimbursementTotal: reimb,
    deductions: [
      ...(other ? [{ code: "EPF", name: "EPF (employee)", amount: other }] : []),
      ...(tds ? [{ code: "TDS", name: "Income tax (TDS)", amount: tds }] : []),
    ],
    earnings: [],
    reimbursements: [],
    employer: [],
    employerTotal: 0,
    paidDays: 30,
    basisDays: 30,
    lopDays: 0,
  },
})

test("fyOf matches the engine on every month boundary", () => {
  for (const m of ["2026-03-01", "2026-04-01", "2026-04-30", "2026-12-15", "2027-01-01", "2027-03-31", "2026-09"]) {
    assert.deepEqual(pay.fyOf(m), admin.fyOf(m), m)
  }
  assert.equal(pay.fyOf("2026-09-01").label, "2026-27")
  assert.equal(pay.fyOf("2027-02-01").label, "2026-27")
  assert.equal(pay.fyOf("2026-03-01").label, "2025-26")
})

test("rupeesInWords matches the engine", () => {
  for (const n of [0, 1, 19, 20, 99, 100, 101, 999, 1000, 23400, 100000, 123456.78, 1000000, 10000000, 98765432, -5000]) {
    assert.equal(pay.rupeesInWords(n), admin.rupeesInWords(n), String(n))
  }
  assert.equal(pay.rupeesInWords(23400), "Rupees Twenty Three Thousand Four Hundred Only")
  assert.equal(pay.rupeesInWords(1250000), "Rupees Twelve Lakh Fifty Thousand Only")
})

test("groupByFy puts the newest year and the newest slip first", () => {
  const groups = pay.groupByFy([
    slip("a", "2026-03-01", { gross: 1, net: 1 }),
    slip("b", "2026-05-01", { gross: 1, net: 1 }),
    slip("c", "2026-09-01", { gross: 1, net: 1 }),
    slip("d", "2026-04-01", { gross: 1, net: 1 }),
  ])
  assert.deepEqual(
    groups.map((g) => g.fy),
    ["2026-27", "2025-26"],
  )
  assert.deepEqual(
    groups[0].slips.map((s) => s.id),
    ["c", "b", "d"],
  )
  assert.deepEqual(pay.groupByFy([]), [])
})

test("ytdTotals sums only the financial year, and the slices add up to gross", () => {
  const slips = [
    slip("old", "2026-03-01", { gross: 50000, net: 45000, tds: 1000, other: 4000 }),
    slip("apr", "2026-04-01", { gross: 30000, net: 26100, tds: 300, other: 3600 }),
    slip("may", "2026-05-01", { gross: 30000, net: 27600, tds: 300, other: 3600, reimb: 1500 }),
  ]
  const t = pay.ytdTotals(slips)
  assert.equal(t.fy, "2026-27")
  assert.equal(t.count, 2)
  assert.equal(t.gross, 60000)
  assert.equal(t.net, 53700)
  assert.equal(t.tds, 600)
  assert.equal(t.deductions, 7200)
  assert.equal(t.reimbursements, 1500)
  assert.equal(t.net + t.tds + t.deductions, t.gross + t.reimbursements)

  const last = pay.ytdTotals(slips, "2026-02-01")
  assert.equal(last.fy, "2025-26")
  assert.equal(last.count, 1)

  assert.equal(pay.ytdTotals([]).count, 0)
})

test("netPayTrend is the last n payslips, oldest first", () => {
  const slips = ["01", "02", "03", "04", "05", "06", "07", "08"].map((m, i) =>
    slip(m, `2026-${m}-01`, { gross: 100 * (i + 1), net: 90 * (i + 1) }),
  )
  const trend = pay.netPayTrend(slips, 6)
  assert.equal(trend.length, 6)
  assert.deepEqual(
    trend.map((x) => x.label),
    ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
  )
  assert.equal(trend[5].net, 720)
})

test("money drops .00 but keeps paise, with Indian grouping", () => {
  assert.equal(pay.money(123456), "₹1,23,456")
  assert.equal(pay.money(1234.5), "₹1,234.50")
  assert.equal(pay.money(0), "₹0")
  assert.equal(pay.monthLabel("2026-09-01"), "September 2026")
  assert.equal(pay.monthShort("2026-12"), "Dec")
  assert.equal(pay.daysText(1), "1 day")
  assert.equal(pay.daysText(21.5), "21.5 days")
})

test("loanProgress never goes below zero", () => {
  assert.deepEqual(pay.loanProgress(10000, [{ amount: 2000 }, { amount: 2000 }]), { recovered: 4000, balance: 6000 })
  assert.deepEqual(pay.loanProgress(1000, [{ amount: 1500 }]), { recovered: 1500, balance: 0 })
})

test("payTermsOf matches the engine: pay types, and an older revision is monthly at its gross", () => {
  const revs = [
    { pay_type: "monthly", daily_rate: null, monthly_gross: 27000, earnings: [{ code: "SALARY", name: "Salary", amount: 27000 }] },
    { pay_type: "daily", daily_rate: 800, monthly_gross: 0, earnings: [] },
    { monthly_gross: 28200, earnings: [{ code: "BASIC", amount: 15000 }, { code: "HRA", amount: 6000 }, { code: "CONV", amount: 1600 }, { code: "FIXED", amount: 5600 }] },
    { monthly_gross: 20000, earnings: [] },
    null,
  ]
  for (const r of revs) assert.deepEqual(pay.payTermsOf(r), admin.payTermsOf(r))
  assert.deepEqual(pay.payTermsOf(revs[1]), { type: "daily", rate: 800 })
  assert.deepEqual(pay.payTermsOf(revs[2]), { type: "monthly", rate: 28200 })
})

test("slipDaysText reads the pay type", () => {
  assert.equal(pay.slipDaysText({ payType: "monthly", paidDays: 26, basisDays: 30 }), "Paid days: 26 of 30")
  assert.equal(pay.slipDaysText({ payType: "daily", daysWorked: 24 }), "Days worked: 24")
  // An older slip has no pay type: paid days of the basis, as before.
  assert.equal(pay.slipDaysText({ paidDays: 29, basisDays: 30 }), "Paid days: 29 of 30")
  // An off-cycle slip has no days.
  assert.equal(pay.slipDaysText({}), "")
})

test("payRows shows the engine's new lines with their notes, and an older slip's statutory lines as stored", () => {
  const slip = admin.computePayslip({
    month: "2026-09-01",
    terms: { type: "monthly", rate: 27000 },
    paidDays: 26,
    basisDays: 30,
    oneTime: [admin.overtimeItem({ minutes: 300, dayRate: 900, shiftMin: 540 })],
    loans: [{ id: "L1", name: "Salary advance", balance: 9000, instalment: 3000 }],
  })
  assert.deepEqual(
    rows.payRows(slip.earnings).map((r) => [r.label, r.values[0], r.note]),
    [
      ["Salary", "₹23,400", "₹27,000, paid days 26 of 30"],
      ["Overtime", "₹500", "5h at ₹100/h"],
    ],
  )
  assert.deepEqual(
    rows.payRows(slip.deductions).map((r) => [r.label, r.values[0], r.note]),
    [["Salary advance recovered", "₹3,000", "balance ₹6,000"]],
  )
  const daily = admin.computePayslip({ month: "2026-09-01", terms: { type: "daily", rate: 800 }, daysWorked: 24 })
  assert.deepEqual(rows.payRows(daily.earnings).map((r) => [r.label, r.values[0], r.note]), [["Daily wage", "₹19,200", "days worked 24 x ₹800"]])
  const old = [{ code: "EPF", name: "EPF (employee)", amount: 1800 }, { code: "TDS", name: "Income tax (TDS)", amount: 0 }]
  assert.deepEqual(rows.payRows(old).map((r) => r.label), ["EPF (employee)"])
})
