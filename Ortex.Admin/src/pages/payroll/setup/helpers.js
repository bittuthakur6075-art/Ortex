// Plain helpers shared by the payroll setup pages: money, month inputs, dates,
// the IFSC shape, a pay type in words and what is missing before someone can be paid.

import { formatCurrency } from "../../../lib/format"
import { payTermsOf } from "../../../lib/payroll"

export const money = (n) => formatCurrency(Number(n) || 0)

/** This month in IST, as "YYYY-MM". */
export function thisMonthIST() {
  const d = new Date(Date.now() + 330 * 60000)
  return d.toISOString().slice(0, 7)
}

/** "2026-09-01" → "2026-09" for <input type="month">, and back. */
export const toMonthInput = (d) => (d ? String(d).slice(0, 7) : "")
export const fromMonthInput = (v) => (v ? `${v}-01` : "")

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "Sep 2026" */
export function monthLabel(d) {
  if (!d) return ""
  const [y, m] = String(d).split("-").map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** "19 Sep 2026" */
export function dateLabel(d) {
  if (!d) return ""
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number)
  return `${day} ${MONTHS[m - 1]} ${y}`
}

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

/** What is still missing before this person can be paid, in words. */
export function missingFor(person) {
  const e = person.employee || {}
  const out = []
  if (!person.revisions?.length) out.push("salary")
  if (e.pay_mode === "bank" || !e.pay_mode) {
    if (!e.account_last4 || !e.ifsc) out.push("bank")
  }
  return out
}

/** "₹27,000 a month" or "₹800 a day" for a salary revision. */
export function payWords(rev) {
  const t = payTermsOf(rev)
  if (!t) return ""
  return `${money(t.rate)} ${t.type === "daily" ? "a day" : "a month"}`
}
