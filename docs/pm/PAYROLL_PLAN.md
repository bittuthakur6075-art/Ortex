# Payroll: design and rules

Status (2026-10-03): **simplified** (owner's decision). Built on migration 0040 (applied 2026-09-19); migration **0077** adds pay types, `payroll_days_worked()` and stops new claims. Console: `/payroll` (Overview, Pay runs, Employees, Advances) with settings in the Control centre; `/my-records?tab=payslips`. Phone: Profile → My pay (payslips + PDF, pay rate, advances) and a payslip alert. Not yet run end to end with real salaries.

## What was removed, and what stays readable

Removed from the product: PF, ESI, professional tax, TDS (projection, regime, investment declarations, Form 16 / 24Q), LWF, statutory reports and files (ECR, ESIC upload, salary register, TDS summary), salary components and templates (Basic, HRA, ...), arrears from back-dated revisions, reimbursement claims (console Approvals, the phone's claim screens; `claim_submit` refuses since 0077), and the 50% deduction cap.

Nothing was dropped from the database. Every PAID payslip keeps the lines it was stored with and prints them as they are (console sheet and PDF, phone screen and PDF), statutory lines included. Old salary revisions, claims, components, templates and settings stay in their tables.

## Who

| | Payroll settings | Run payroll, employees, advances | Own payslips |
|---|---|---|---|
| Super Admin | ● | ● | ● |
| Accounts | · | ● (the `payroll` grant, by default) | ● |
| Admin | · | only if granted `payroll` | ● |
| Sales Executive, Staff | · | · | ● |

`is_payroll()` (0040, 0053, 0055) never uses `is_admin()`. Salary tables are not in the 0023 audit trail; `payroll_audit` is their history, readable by payroll only.

## Pay types (on the effective-dated salary revision)

* **Monthly salary**: `pay_type = 'monthly'`, `monthly_gross` = the salary (`earnings` holds one SALARY line). Pay = salary × paid days / basis days. Paid days are attendance's payable days (`attendance_month_summary`), clamped to the employed span; the basis is the month's actual days or a fixed 26 / 30 (settings).
* **Daily wage**: `pay_type = 'daily'`, `daily_rate`. Pay = days worked × rate. Days worked count only the effective status (override, else computed): P = 1, OD = 1, HD = 0.5; WO, H, L, LOP, A and MP are 0, so Sundays, holidays and leave are not paid. Read through `payroll_days_worked(month)` (0077, security definer, `is_payroll()`), because payroll may not hold `attendance-team`.
* **An older revision** (no `pay_type`) is monthly at the sum of its earning components (its gross): `payTermsOf` in `lib/payroll.js` (mirrored in the phone's `payFormat.ts`).

Both are paid monthly, in the same run.

## The rules the engine applies (`Ortex.Admin/src/lib/payroll.js`, tested in `payroll.test.js`)

* **Overtime at 1x** (owner's decision 2026-10-03): hourly rate = one day's pay / shift hours, where one day's pay is salary / basis days (monthly) or the daily rate (daily); the shift comes from the attendance settings (9h by default). Minutes are the month's `attendance_overtime` inside the employed span, weekly offs and holidays included. Per person on the run, payroll chooses **Auto-calculate** (default when "Pay overtime automatically" is on) or **Enter amount** (a rupee figure typed after seeing the hours, 0 pays none). The choice is kept on the slip (`overtimeInput`) across Calculate; the slip shows the hours and, for auto, the rate.
* **One-time items**: earnings (bonus, incentive, anything named) and deductions (other recoveries).
* **Advances** (the `loans` table): recorded with amount, date paid, note and recovery (in full in one pay run, or N monthly instalments) from Advances, a pay profile or the run screen. Each regular run deducts the instalment, never more than the balance; payroll can change or skip one month's recovery per person (`recoverInput`, kept across Calculate). The slip line reads "Salary advance recovered ₹X (balance ₹Y)". Recoveries are written when the run is paid (`payroll_run_transition`), and an advance closes itself once recovered.
* **Net pay never goes below zero**: deductions that do not fit the gross are carried forward (shown on the slip).
* **Off-cycle runs** (a bonus, a settlement top-up) pay only their one-time items: no salary, overtime or advance recovery.

## Pay runs

Draft → submit → approve (someone other than the submitter, or the Super Admin) → record payment, recallable until paid; a regular run cannot be submitted, approved or paid until its month's attendance is locked (0065). Calculate refuses when the attendance summary, the days worked (with any daily-wage person) or, with auto overtime on, the overtime cannot be read. A payslip reaches its employee only once the run is paid. An approved run gives the bank transfer CSV (columns set in settings; full account numbers through `payroll_bank_details`, logged) and all payslips in one PDF.

## Worked examples

* Monthly ₹27,000, 30-day month, 26 paid days, 5h overtime: salary 27,000 × 26 / 30 = ₹23,400; hourly rate 27,000 / 30 / 9 = ₹100; overtime 5 × 100 = ₹500; gross ₹23,900.
* Daily ₹800, 22 P + 2 HD + 1 OD, 3h overtime: days worked 22 + 1 + 1 = 24; wages 24 × 800 = ₹19,200; hourly rate 800 / 9 = ₹88.89; overtime 3 × 88.89 = ₹267 (rounded); gross ₹19,467.

## Settings (Control centre → Payroll, Super Admin)

Organisation name and address (printed on payslips), pay schedule (basis, pay day, pay overtime automatically), bank file (debit account, IFSC, narration, column order).
