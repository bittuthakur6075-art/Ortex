# Payroll: design and rules

Status (2026-09-19): **built, migration 0040 applied to production.** Console: `/payroll` (dashboard, pay runs, employees, approvals, loans, reports, settings) and `/payslips`. Phone: Profile → My pay (payslips + PDF, salary, reimbursement claims), and a payslip alert. Nothing has been run end to end with real salaries yet. The app reference is **Zoho Payroll (India)**, owner's choice, rebuilt inside Ortex; there is no Zoho subscription.

## Who

| | Payroll (settings) | Run payroll, employees, loans, claims | Own payslips |
|---|---|---|---|
| Super Admin | ● | ● | ● |
| Accounts | · | ● (the `payroll` grant, by default) | ● |
| Admin | · | only if granted `payroll` | ● |
| Sales Executive, Staff | · | · | ● |

- **Who counts as payroll.** `is_payroll()` (migration 0040) returns true for the Super Admin, plus anyone whose role grants or personal extras include `payroll`. It never uses `is_admin()`, because a salary is not something every Admin sees.
- **Separate history.** Salary tables are **not** part of the 0023 audit trail, which every member of staff can read. `payroll_audit` is their history instead, and only payroll can read it.

## Structure (Zoho Payroll's)

**Settings (Super Admin)**
- organisation statutory IDs (PAN, TAN, PF code, ESI code, LWF registration);
- pay schedule: salary on the month's actual days or a fixed 26 / 30, and pay day;
- EPF / ESI / LWF / PT / TDS;
- the deduction cap;
- the bank file columns;
- salary components and salary templates.

**Employees**
- the pay profile: PAN and bank account are **encrypted** with a key the database generates in Vault. Only the last four digits are stored in the clear, and every reveal is logged.
- statutory flags: PF, ESI, LWF, TDS, and tax regime.
- exit.
- salary revisions: annual CTC with an **Effective From** and a **Payout Month**. A back-dated revision pays its **arrears** automatically.

**Pay runs**
- The flow is draft → submit → approve (a second person, or the Super Admin) → record payment, and a run can be recalled until it is paid.
- In the draft you can edit paid days, add one-time earnings and deductions, and skip or withhold an employee.
- A payslip is visible to its employee **only once the run is paid**.

**Off-cycle runs** (a bonus, an incentive, a settlement top-up) pay only the one-time items added to them: no monthly salary, loans, claims or arrears, and everyone starts as Skip. TDS and LWF are left to the next regular run, whose projection counts the payout and catches the tax up.

**Approvals:** reimbursement claims, submitted from the phone with a receipt.

**Loans:** an instalment is recovered in each pay run, and the loan closes itself when it is fully recovered.

**Reports and files**
- salary register (Form IV style);
- bank transfer CSV;
- EPFO ECR (11 fields, `#~#`);
- ESIC monthly upload;
- TDS summary.

## The rules the engine applies (`Ortex.Admin/src/lib/payroll.js`, tested in `payroll.test.js`)

- **Paid days.**
  - Paid days come from attendance's payable days for the month (`attendance_month_summary`), clamped to the part of the month the person was employed.
  - On the actual-days basis, paid = payable. On a fixed basis, paid = fixed days × the employed share, less the unpaid days.
- **Code on Wages "wages"** (s.2(y)) are the in-wages components (Basic, Fixed allowance). If the excluded ones (HRA, conveyance) carry more than half of the pay, the excess counts as wages too. Wages are the PF base.
- **EPF.**
  - 12% employee and 12% employer, of which 8.33% goes to EPS, always capped at the ceiling. EDLI and admin are 0.5% each.
  - The wage is restricted to the **dated** ceiling: ₹15,000 is seeded.
  - **The Cabinet approved ₹25,000 on 16 Sep 2026.** Add it in Settings with its date once EPFO notifies it.
- **ESI:** 0.75% employee and 3.25% employer of gross, rounded up. It applies to people flagged ESI (gross ₹21,000 or less at the start of the contribution period).
- **Delhi LWF:** ₹0.75 employee and ₹2.25 employer, deducted in June and December. There is no professional tax in Delhi.
- **TDS.**
  - Each month the year's taxable salary is projected: paid so far + this month + the current structure × the months left.
  - From that, the standard deduction is taken (₹75,000 new regime, ₹50,000 old), plus declared deductions under the old regime.
  - Slabs for FY 2026-27 are unchanged by Budget 2026. The rebate: nothing is payable up to ₹12 lakh taxable, with marginal relief just above. Cess is 4%.
  - The monthly figure is that year's tax, less TDS already deducted, divided by the months left.
  - The Income-tax Act 2025 applies from 1 Apr 2026: Form 16 is now Form 130, and the investment declaration is Form 124.
- **Deduction cap** (Code on Wages s.18): total deductions may not exceed 50% of the month's wages. Loan instalments and one-time deductions give way first, and the excess carries forward.
- **Salary structure from CTC:**
  - Basic is 50% of monthly CTC, HRA 40% of Basic, conveyance ₹1,600.
  - Fixed allowance is the **balance**, after the employer's PF when that is included in CTC.

## Still to verify (as of 2026-09-19)

1. The EPFO gazette for the ₹25,000 ceiling, and how September 2026 is split.
2. Any Delhi minimum-wage revision after April 2025: Unskilled ₹18,456, Semi-skilled ₹20,371, Skilled ₹22,411 a month.
3. Delhi's final wage rules, and the exact fields of Form V (wage slip) and Form IV (register).
4. The form number for choosing the old regime.
5. Whether statutory bonus uses the central or the Delhi minimum wage.

Not in this version:
- the bonus and gratuity provision;
- Form 124 declarations with proof upload;
- the Form 130 / 138 exports;
- the professional tax slabs for other states;
- pushing the Tally salary journal.
