// The payslip page (Zoho Payroll's standard layout) is one template printed by
// both clients: src/documents/payslipTemplate.ts here, and its generated copy
// Ortex.Admin/src/lib/payslipTemplate.js in the console. These tests fail if
// the two print a different page, and pin the Zoho wording and number format.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/payslipTemplate.js"))
const phone = await loadTs("documents/payslipTemplate.ts")

const input = {
  company: { name: "Ortex Industries", address: ["RZ-4 Mahindra Park, Uttam Nagar", "New Delhi, Delhi 110059"], logo: "/logo.svg" },
  month: "September 2026",
  title: null,
  withheld: false,
  payDate: "2026-10-05",
  employee: { name: "Rahul Verma", employee_code: "ORX-014", designation: "Sales Executive", doj: "2025-04-07", pan_last4: "432K", uan: "101234567890", bank_name: "HDFC Bank", account_last4: "7788" },
  paidDays: 29,
  lopDays: 1,
  earnings: [
    { name: "Basic", amount: 9667, ytd: 57667 },
    { name: "Sales incentive", amount: 1500, ytd: null },
  ],
  deductions: [{ name: "EPF (employee)", amount: 1491, ytd: 8691 }],
  reimbursements: [{ name: "Reimbursement: Fuel", amount: 850 }],
  gross: 11167,
  totalDeductions: 1491,
  reimbursementTotal: 850,
  netPay: 10526,
}

test("the console prints exactly the page the phone prints", () => {
  assert.equal(admin.payslipBody(input), phone.payslipBody(input))
  assert.equal(admin.PAYSLIP_CSS, phone.PAYSLIP_CSS)
})

test("amounts are rupees with paise in Indian grouping", () => {
  assert.equal(phone.inr(17556), "₹17,556.00")
  assert.equal(phone.inr(1234567.5), "₹12,34,567.50")
  assert.equal(phone.inr(0), "₹0.00")
})

test("the amount in words reads as Zoho writes it", () => {
  assert.equal(phone.amountInWords(17556), "Indian Rupee Seventeen Thousand Five Hundred Fifty-Six Only")
  assert.equal(phone.amountInWords(1250000), "Indian Rupee Twelve Lakh Fifty Thousand Only")
  assert.equal(phone.amountInWords(100.5), "Indian Rupee One Hundred and Fifty Paise Only")
})

test("the page carries Zoho's sections and the pay date as dd/MM/yyyy", () => {
  const html = phone.payslipBody(input)
  for (const s of ["Payslip For the Month", "Employee Summary", "Total Net Pay", "Paid Days", "LOP Days", "YTD", "Total Net Payable", "Amount In Words", "This is a system-generated document."]) {
    assert.ok(html.includes(s), s)
  }
  assert.ok(html.includes("05/10/2026"))
  assert.ok(html.includes("Gross Earnings - Total Deductions + Reimbursements"))
})

test("a slip from 2026-10-03 prints its pay type and days, and no PAN, UAN or LOP for a daily wage", () => {
  const daily = { ...input, payType: "daily", daysWorked: 24, paidDays: undefined, lopDays: undefined, employee: { ...input.employee, pan_last4: null, uan: null }, earnings: [{ name: "Daily wage (days worked 24 x ₹800)", amount: 19200, ytd: 19200 }], deductions: [{ name: "Salary advance recovered (balance ₹6,000)", amount: 3000, ytd: 3000 }], reimbursements: [], reimbursementTotal: 0 }
  const html = phone.payslipBody(daily)
  assert.equal(admin.payslipBody(daily), html)
  for (const s of ["Pay Type", "Daily wage", "Days Worked", "Salary advance recovered (balance ₹6,000)"]) assert.ok(html.includes(s), s)
  for (const s of ["PAN", "UAN", "LOP Days", "Reimbursements"]) assert.ok(!html.includes(s), s)
  const monthly = phone.payslipBody({ ...daily, payType: "monthly", paidDays: 26, basisDays: 30, lopDays: 4 })
  assert.ok(monthly.includes("Monthly salary") && monthly.includes(": 26 of 30") && monthly.includes("LOP Days"))
})
