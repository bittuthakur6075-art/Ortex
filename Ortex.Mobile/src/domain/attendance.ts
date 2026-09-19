// Attendance, the pure half (docs/pm/ATTENDANCE_LEAVE_PLAN.md). MIRRORED
// line for line by Ortex.Admin/src/lib/attendance.js: edit both.
//
// The server (migration 0033, attendance_punch) is the authority on distance,
// time and whether a punch counts. These functions only turn its rows and its
// answers into what a person reads: a day's first in and last out, the hours in
// between, the flags in words, and a sentence for every refusal. Everything
// takes `now` so a test is not a race with the clock.

export type PunchKind = "in" | "out"
export type PunchReview = "ok" | "flagged" | "accepted" | "rejected"

export type Punch = {
  id: string
  user_id: string
  kind: PunchKind
  at: string
  day: string
  lat?: number | null
  lng?: number | null
  accuracy_m?: number | null
  mocked?: boolean
  mode: "office" | "field"
  site_name?: string | null
  distance_m?: number | null
  inside?: boolean | null
  note?: string | null
  selfie_path?: string | null
  offline?: boolean
  flags?: string[] | null
  review: PunchReview
  review_note?: string | null
}

/** What attendance_punch() answers. */
export type PunchResult = {
  status:
    | "ok"
    | "flagged"
    | "refused"
    | "no_location"
    | "no_selfie"
    | "already_in"
    | "not_in"
    | "day_done"
    | "no_site"
    | "weak_gps"
    | "outside"
  message?: string
  id?: string
  kind?: PunchKind
  at?: string
  mode?: "office" | "field"
  site?: string | null
  distanceM?: number | null
  radiusM?: number | null
  accuracyM?: number | null
  flags?: string[]
  repeat?: boolean
}

/** What attendance_check() answers, before any punch. */
export type LocationCheck = {
  mode: "office" | "field"
  sitesConfigured: boolean
  site: string | null
  radiusM: number | null
  distanceM: number | null
  accuracyM: number | null
  accuracyOk: boolean
  maxAccuracyM: number
  inside: boolean
  mustBeInside: boolean
  openSince: string | null
  serverNow: string
}

export const TIMEZONE = "Asia/Kolkata"
const MINUTE = 60000
const IST_OFFSET_MIN = 330

/** The company day (IST) a moment belongs to, as YYYY-MM-DD. */
export function dayKey(t: string | number | Date): string {
  const ms = new Date(t).getTime() + IST_OFFSET_MIN * MINUTE
  return new Date(ms).toISOString().slice(0, 10)
}

/** 9:42 AM, in IST whatever the phone's own zone. */
export function clockIST(t: string | number | Date): string {
  const d = new Date(new Date(t).getTime() + IST_OFFSET_MIN * MINUTE)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

/** 7h 45m · 45m · 0m */
export function durationWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

/** Punches that count: everything except what was rejected. */
export const counted = (punches: Punch[]) => punches.filter((p) => p.review !== "rejected")

export type DaySummary = {
  day: string
  firstIn: string | null
  lastOut: string | null
  /** Minutes between each in and the out after it; an open in runs to `now`. */
  workedMin: number
  /** Clocked in with no clock out yet. */
  open: boolean
  punches: Punch[]
  flagged: number
  field: boolean
  site: string | null
}

/** One day's punches (any order) → what the day looked like. */
export function summarizeDay(day: string, punches: Punch[], now = Date.now()): DaySummary {
  const all = [...punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const valid = counted(all)
  let worked = 0
  let openAt: number | null = null
  for (const p of valid) {
    const t = new Date(p.at).getTime()
    if (p.kind === "in") {
      if (openAt === null) openAt = t
    } else if (openAt !== null) {
      worked += (t - openAt) / MINUTE
      openAt = null
    }
  }
  const open = openAt !== null
  // An open in still counts up to now, but never past the end of its own day.
  if (openAt !== null) {
    const dayEnd = new Date(`${day}T00:00:00+05:30`).getTime() + 24 * 60 * MINUTE
    worked += Math.max(0, (Math.min(now, dayEnd) - openAt) / MINUTE)
  }
  const ins = valid.filter((p) => p.kind === "in")
  const outs = valid.filter((p) => p.kind === "out")
  return {
    day,
    firstIn: ins[0]?.at ?? null,
    lastOut: outs.length ? outs[outs.length - 1].at : null,
    workedMin: Math.round(worked),
    open,
    punches: all,
    flagged: all.filter((p) => p.review === "flagged").length,
    field: valid.some((p) => p.mode === "field"),
    site: valid.find((p) => p.site_name)?.site_name ?? null,
  }
}

/** Punches → one summary per day, newest day first. */
export function summarizeDays(punches: Punch[], now = Date.now()): DaySummary[] {
  const by = new Map<string, Punch[]>()
  for (const p of punches) {
    const k = p.day || dayKey(p.at)
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(p)
  }
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => summarizeDay(day, list, now))
}

/** The latest punch that counts decides whether the person is on duty now. */
export function onDutySince(punches: Punch[], now = Date.now()): string | null {
  const valid = counted(punches).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const last = valid[0]
  if (!last || last.kind !== "in") return null
  // The server treats an in older than 20 hours as closed; so do we.
  return now - new Date(last.at).getTime() < 20 * 60 * MINUTE ? last.at : null
}

export const FLAG_LABEL: Record<string, string> = {
  offline: "Saved offline",
  clock_skew: "Phone clock was off",
  outside: "Outside the office area",
  low_accuracy: "Weak location",
  mock_location: "Fake location detected",
  regularised: "Corrected on request",
  short_hours: "Too few hours",
  worked_off_day: "Worked on a day off",
  half_leave: "Half day on leave",
  worked_on_leave: "Worked while on leave",
}

export const flagWords = (flags?: string[] | null) => (flags || []).map((f) => FLAG_LABEL[f] || f)

export const REVIEW_LABEL: Record<PunchReview, string> = {
  ok: "Recorded",
  flagged: "Needs review",
  accepted: "Accepted",
  rejected: "Not accepted",
}

/** One line for the result screen, from the server's answer. */
export function resultSentence(r: PunchResult): string {
  if (r.status === "ok" || r.status === "flagged") {
    const verb = r.kind === "out" ? "Clocked out" : "Clocked in"
    const at = r.at ? ` at ${clockIST(r.at)}` : ""
    const where =
      r.mode === "field" ? " · Field visit" : r.site ? ` · ${r.site}${r.distanceM != null ? ` · ${Math.round(r.distanceM)} m` : ""}` : ""
    const flagged = r.status === "flagged" ? `. Sent for review: ${flagWords(r.flags).join(", ").toLowerCase()}` : ""
    return `${verb}${at}${where}${flagged}`
  }
  return r.message || "That did not go through. Try again."
}

/** How far outside the fence a check reading is, for the "you are outside" state. */
export function metresOutside(c: Pick<LocationCheck, "distanceM" | "radiusM">): number {
  if (c.distanceM == null || c.radiusM == null) return 0
  return Math.max(0, Math.round(c.distanceM - c.radiusM))
}

/** Where a selfie goes in the private bucket: <uid>/<yyyy>/<mm>/<punch-id>.jpg */
export function selfiePath(userId: string, punchId: string, at: number | Date = Date.now()): string {
  const d = new Date(new Date(at).getTime() + IST_OFFSET_MIN * MINUTE)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${userId}/${yyyy}/${mm}/${punchId}.jpg`
}

// ---- phase 2: what a day counts as (attendance_days, migration 0034) -----------------------

export type DayStatus = "P" | "HD" | "A" | "OD" | "WO" | "H" | "MP" | "L" | "LOP"

export type AttendanceDay = {
  user_id: string
  day: string
  status: DayStatus
  first_in?: string | null
  last_out?: string | null
  worked_min?: number
  late?: boolean
  late_min?: number
  flags?: string[] | null
  override_status?: DayStatus | null
  override_reason?: string | null
}

/** The Super Admin's override wins over the computed status. */
export const effectiveStatus = (d: Pick<AttendanceDay, "status" | "override_status">): DayStatus =>
  d.override_status || d.status

export const STATUS_LABEL: Record<DayStatus, string> = {
  P: "Present",
  HD: "Half day",
  A: "Absent",
  OD: "On duty (field)",
  WO: "Weekly off",
  H: "Holiday",
  MP: "Missed punch",
  L: "Leave",
  LOP: "Loss of pay",
}

/** The console's and the phone's status tone names (emerald/amber/rose/…). */
export const STATUS_TONE: Record<DayStatus, "emerald" | "amber" | "rose" | "cyan" | "slate" | "primary" | "violet"> = {
  P: "emerald",
  OD: "cyan",
  HD: "amber",
  MP: "amber",
  A: "rose",
  LOP: "rose",
  L: "violet",
  WO: "slate",
  H: "slate",
}

export type MonthTotals = {
  counts: Record<DayStatus, number>
  lates: number
  latePenalty: number
  workedMin: number
  payable: number
}

/**
 * A month of days → the figures payroll reads. The SAME formula as the
 * database's attendance_month_summary(): P + OD + WO + H + L, plus half of each
 * HD and MP, less every `lateRule.count` lates × `lateRule.deductDays`.
 */
export function monthTotals(
  days: AttendanceDay[],
  lateRule: { count?: number; deductDays?: number } = {},
): MonthTotals {
  const counts = { P: 0, HD: 0, A: 0, OD: 0, WO: 0, H: 0, MP: 0, L: 0, LOP: 0 } as Record<DayStatus, number>
  let lates = 0
  let workedMin = 0
  for (const d of days) {
    counts[effectiveStatus(d)] += 1
    if (d.late) lates += 1
    workedMin += d.worked_min || 0
  }
  const per = Math.max(1, lateRule.count ?? 3)
  const latePenalty = Math.floor(lates / per) * (lateRule.deductDays ?? 0.5)
  const payable = Math.max(
    0,
    counts.P + counts.OD + counts.WO + counts.H + counts.L + 0.5 * (counts.HD + counts.MP) - latePenalty,
  )
  return { counts, lates, latePenalty, workedMin, payable }
}

export type GridCell = { day: string; date: number; inMonth: boolean; entry: AttendanceDay | null }

/**
 * The month as calendar weeks, Monday first, padded with the neighbouring
 * months' dates (inMonth false) so every row has seven cells.
 */
export function monthGrid(year: number, month: number, days: AttendanceDay[]): GridCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const inMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: GridCell[] = []
  const total = Math.ceil((lead + inMonthDays) / 7) * 7
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 + i - lead))
    const key = d.toISOString().slice(0, 10)
    const inMonth = d.getUTCMonth() === month - 1
    cells.push({ day: key, date: d.getUTCDate(), inMonth, entry: inMonth ? byDay.get(key) ?? null : null })
  }
  const weeks: GridCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** "September 2026" and its first/last day, for a month switcher. */
export function monthBounds(year: number, month: number): { from: string; to: string; label: string } {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, "0")
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}`, label: `${names[month - 1]} ${year}` }
}

export const REGULARISATION_LABEL: Record<string, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
}

// ---- phase 3: leave (migration 0036) ---------------------------------------------------------

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled"
export type FromHalf = "full" | "second"
export type ToHalf = "full" | "first"

export type LeaveBalance = {
  code: string
  name: string
  balance: number
  pending: number
  available: number
  taken_year: number
  paid: boolean
  half_day: boolean
  accrual: "monthly" | "upfront" | "manual" | "none"
  annual: number
}

export type LeaveRequest = {
  id: string
  user_id: string
  type_code: string
  from_day: string
  to_day: string
  from_half: FromHalf
  to_half: ToHalf
  days: number
  sandwich?: boolean
  reason: string
  attachment_path?: string | null
  status: LeaveStatus
  decided_by?: string | null
  decided_at?: string | null
  decision_note?: string | null
  created_at: string
}

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
}

export const LEAVE_STATUS_TONE: Record<LeaveStatus, "amber" | "emerald" | "rose" | "slate"> = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
  cancelled: "slate",
}

export const LEDGER_REASON_LABEL: Record<string, string> = {
  accrual: "Accrued",
  grant: "Granted",
  taken: "Taken",
  reversal: "Given back",
  lapse: "Lapsed",
  adjust: "Adjusted",
}

const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/**
 * Leave days between two dates, the way the server counts them
 * (leave_days_between, migration 0036): weekly offs and holidays are not leave,
 * unless the sandwich rule is on and they sit strictly inside the range; a
 * half day takes 0.5 off the first and/or last day. For the Apply screen's
 * live count; the server's count is the one that is saved.
 */
export function leaveDaysBetween(
  from: string,
  to: string,
  fromHalf: FromHalf,
  toHalf: ToHalf,
  rules: { weeklyOff?: number[]; holidays?: string[]; sandwich?: boolean } = {},
): number {
  if (!from || !to || to < from) return 0
  const off = new Set(rules.weeklyOff ?? [0])
  const hol = new Set(rules.holidays ?? [])
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const isOff = off.has(dayOfWeek(d)) || hol.has(d)
    if (!isOff || (rules.sandwich && d > from && d < to)) {
      n += 1 - (d === from && fromHalf === "second" ? 0.5 : 0) - (d === to && toHalf === "first" ? 0.5 : 0)
    }
  }
  return Math.max(0, n)
}

/** "4.5 days" · "1 day" · "0.5 day" */
export const daysWords = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 || n === 0.5 ? "day" : "days"}`

/** What is left of a balance after a request, for "balance after this request". */
export const balanceAfter = (b: Pick<LeaveBalance, "available" | "accrual">, days: number) =>
  b.accrual === "none" ? null : Math.round((b.available - days) * 10) / 10
