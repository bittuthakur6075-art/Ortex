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

test("claimBlocker mirrors claim_submit's rules", () => {
  const today = "2026-09-19"
  const ok = { category: "Fuel", amount: "450", billDate: today, hasReceipt: true }
  assert.equal(pay.claimBlocker(ok, today), null)
  assert.equal(pay.claimBlocker({ ...ok, category: "" }, today), "Choose a category")
  assert.equal(pay.claimBlocker({ ...ok, amount: "" }, today), "Enter the amount")
  assert.equal(pay.claimBlocker({ ...ok, amount: "0" }, today), "Enter the amount")
  assert.equal(pay.claimBlocker({ ...ok, amount: "2,00,001" }, today), "A single claim can be at most ₹2,00,000")
  assert.equal(pay.claimBlocker({ ...ok, billDate: "2026-09-20" }, today), "The bill date cannot be in the future")
  assert.equal(pay.claimBlocker({ ...ok, billDate: pay.shiftDay(today, -90) }, today), null)
  assert.equal(pay.claimBlocker({ ...ok, billDate: pay.shiftDay(today, -91) }, today), "Claim bills from the last 90 days")
  assert.equal(pay.claimBlocker({ ...ok, hasReceipt: false }, today), "Add a photo of the bill")
})
