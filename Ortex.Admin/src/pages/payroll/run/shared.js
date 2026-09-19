// Shared by the pay-run pages (Dashboard, Pay runs, the run itself, Reports):
// the status vocabulary, the words for a run, and the flattening that turns a
// stored payslip row into what the engine's file builders read.

import { formatCurrency } from "../../../lib/format"

export const money = (n) => formatCurrency(Number(n) || 0)

/** Whole rupees, for tiles and tables where paise are noise. */
export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

export const RUN_STATUS = {
  draft: { label: "Draft", tone: "slate" },
  pending_approval: { label: "Awaiting approval", tone: "amber" },
  approved: { label: "Approved", tone: "blue" },
  paid: { label: "Paid", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "rose" },
}
export const RUN_STATUS_ORDER = ["draft", "pending_approval", "approved", "paid", "cancelled"]

export const SLIP_STATUS = {
  included: { label: "Included", tone: "emerald" },
  skipped: { label: "Skipped", tone: "slate" },
  withheld: { label: "Withheld", tone: "amber" },
}

export const KIND_LABEL = { regular: "Regular", off_cycle: "Off-cycle", settlement: "Final settlement" }

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "September 2026" from "2026-09-01" or "2026-09". */
export function monthWords(m) {
  if (!m) return ""
  const [y, mo] = String(m).split("-").map(Number)
  return `${LONG[mo - 1]} ${y}`
}

/** "Sep 26" for chart categories. */
export function monthShort(m) {
  const [y, mo] = String(m).split("-").map(Number)
  return `${SHORT[mo - 1]} ${String(y).slice(2)}`
}

/** "19 Sep 2026" from "YYYY-MM-DD" (no time zone involved). */
export function dayWords(d) {
  if (!d) return ""
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number)
  return `${day} ${SHORT[m - 1]} ${y}`
}

/** "September 2026" or "September 2026 · Diwali bonus" for an off-cycle run. */
export function runName(run) {
  if (!run) return ""
  const base = monthWords(run.month)
  if (run.kind === "regular") return base
  return `${base} · ${run.title || KIND_LABEL[run.kind] || "Off-cycle"}`
}

/** This month in IST, "YYYY-MM". */
export function thisMonthIST(now = Date.now()) {
  return new Date(now + 330 * 60000).toISOString().slice(0, 7)
}

export function todayISTDay(now = Date.now()) {
  return new Date(now + 330 * 60000).toISOString().slice(0, 10)
}

export function shiftMonth(ym, by) {
  const [y, m] = String(ym).slice(0, 7).split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** The latest month, this one included, that has no regular run yet ("YYYY-MM"). */
export function defaultRunMonth(runs, now = thisMonthIST()) {
  const taken = new Set((runs || []).filter((r) => r.kind === "regular" && r.status !== "cancelled").map((r) => String(r.month).slice(0, 7)))
  for (let i = 0; i < 24; i++) {
    const m = shiftMonth(now, -i)
    if (!taken.has(m)) return m
  }
  return now
}

/** A stored payslip row as the engine's builders read it: the data, the id, user and status on top. */
export function flatSlip(row, run) {
  return {
    ...(row.data || {}),
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    released_at: row.released_at,
    monthLabel: run ? monthWords(run.month) : monthWords(row.data?.month),
  }
}

/** The employee list the builders want, from the payslips' snapshots (plus full bank details when given). */
export function employeesFrom(rows, bank = [], debitIfsc = "") {
  const byUser = new Map((bank || []).map((b) => [b.user_id, b]))
  return rows.map((r) => {
    const e = r.data?.employee || {}
    const b = byUser.get(r.user_id) || {}
    return {
      user_id: r.user_id,
      ...e,
      account_number: b.account_number || "",
      ifsc: b.ifsc || e.ifsc || "",
      account_holder: b.account_holder || e.name || "",
      bank_name: b.bank_name || e.bank_name || "",
      debitIfsc,
    }
  })
}

/** The latest paid regular run before `run`, from a list of runs. */
export function previousPaidRegular(runs, run) {
  return (runs || [])
    .filter((r) => r.id !== run?.id && r.kind === "regular" && r.status === "paid" && (!run || r.month < run.month))
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0] || null
}

/** Change against a previous figure in whole percent, or null when there is nothing to compare. */
export function pctChange(now, before) {
  const a = Number(now) || 0
  const b = Number(before) || 0
  if (!b) return null
  return Math.round(((a - b) / b) * 1000) / 10
}

/** The run's next step in words, for the dashboard card. */
export function nextAction(run) {
  if (!run) return "Create this month's pay run"
  if (run.status === "draft") return run.totals?.employees ? "Review and submit for approval" : "Calculate the payslips"
  if (run.status === "pending_approval") return "Waiting for a second person to approve"
  if (run.status === "approved") return "Pay salaries and record the payment"
  if (run.status === "paid") return "Paid. File PF, ESI and TDS by their due dates"
  return "Cancelled"
}

/** Save text as a file (the bank CSV, the ECR). */
export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save rows as .xlsx. `asText` writes every cell as text (the ESIC portal
 * rejects numbers). Returns false when the spreadsheet library cannot load,
 * so the caller can fall back to CSV.
 */
export async function downloadXlsx(filename, sheets, { asText = false } = {}) {
  let XLSX
  try {
    XLSX = await import("xlsx")
  } catch {
    return false
  }
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    const data = asText ? rows.map((r) => r.map((c) => (c == null ? "" : String(c)))) : rows
    const ws = XLSX.utils.aoa_to_sheet(data)
    if (asText) {
      for (const key of Object.keys(ws)) {
        if (key[0] === "!") continue
        ws[key].t = "s"
        ws[key].z = "@"
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
  return true
}
