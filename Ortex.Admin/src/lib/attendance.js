// Attendance, the pure half. The source is Ortex.Mobile/src/domain/attendance.ts;
// Ortex.Admin/src/lib/attendance.js is GENERATED from it by
// `npm run gen:attendance` in Ortex.Mobile. Edit the TS, never the JS.
//
// The server (migration 0043, attendance_punch) is the authority on the code,
// the time and whether a punch counts. These functions only turn its rows and
// its answers into what a person reads: a day's first in and last out, the
// hours in between, the flags in words, and a sentence for every refusal.
// Everything takes `now` so a test is not a race with the clock.
//
// Attendance is marked by SCANNING the rotating code on the office screen
// (0043). The selfie and the geofence of 0033 are gone from the flow. The
// selfie went entirely on 2026-09-30 (Admin migration 0060): the column, the
// photos and the screens that drew them. The location fields stay on Punch,
// because rows made before 2026-09-20 still carry them.
/**
 * The prefix every Ortex attendance code carries (attendance_qr_payload,
 * migration 0043). The scanner checks it on the phone so a stray QR code on a
 * parcel or a poster is ignored without a round trip to the server, which is
 * also what keeps the camera from firing a request per frame.
 */
export const QR_PREFIX = "ORTEX-ATT1:"
/** Is this scanned string one of ours? */
export const isAttendanceCode = (payload) =>
  typeof payload === "string" && payload.startsWith(QR_PREFIX) && payload.length > QR_PREFIX.length
export const TIMEZONE = "Asia/Kolkata"
const MINUTE = 60000
const IST_OFFSET_MIN = 330
/** The company day (IST) a moment belongs to, as YYYY-MM-DD. */
export function dayKey(t) {
  const ms = new Date(t).getTime() + IST_OFFSET_MIN * MINUTE
  return new Date(ms).toISOString().slice(0, 10)
}
/** 9:42 AM, in IST whatever the phone's own zone. */
export function clockIST(t) {
  const d = new Date(new Date(t).getTime() + IST_OFFSET_MIN * MINUTE)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}
/** 7h 45m · 45m · 0m */
export function durationWords(minutes) {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}
/** Punches that count: everything except what was rejected. */
export const counted = (punches) => punches.filter((p) => p.review !== "rejected")
/**
 * One day's punches (any order) → what the day looked like.
 *
 * `countFrom` is an IST wall time ("09:30"): coming in before it counts FROM
 * it, so nobody banks an hour by arriving early (migration 0056). The punch
 * keeps its own time in firstIn and on the row; only the total moves. Leave it
 * out on a holiday or a weekly off, where there is no shift to be early for.
 */
export function summarizeDay(day, punches, now = Date.now(), countFrom) {
  const all = [...punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const valid = counted(all)
  const floor = countFrom ? new Date(`${day}T${countFrom.padStart(5, "0")}:00+05:30`).getTime() : null
  let worked = 0
  let openAt = null
  for (const p of valid) {
    const t = new Date(p.at).getTime()
    if (p.kind === "in") {
      if (openAt === null) openAt = floor !== null && t < floor ? floor : t
    } else if (openAt !== null) {
      // Never negative: with a floor, an out before it would otherwise subtract.
      worked += Math.max(0, (t - openAt) / MINUTE)
      openAt = null
    }
  }
  // An open in counts up to now while its own day runs. Once the day is over it
  // counts nothing: midnight closes it as an absence with no check-out (0056).
  const over = day < dayKey(now)
  const open = openAt !== null && !over
  const noCheckout = openAt !== null && over
  if (open) worked += Math.max(0, (now - openAt) / MINUTE)
  const ins = valid.filter((p) => p.kind === "in")
  const outs = valid.filter((p) => p.kind === "out")
  return {
    day,
    firstIn: ins[0]?.at ?? null,
    lastOut: outs.length ? outs[outs.length - 1].at : null,
    workedMin: Math.round(worked),
    open,
    noCheckout,
    punches: all,
    flagged: all.filter((p) => p.review === "flagged").length,
    field: valid.some((p) => p.mode === "field"),
    site: valid.find((p) => p.site_name)?.site_name ?? null,
  }
}
/** Punches → one summary per day, newest day first. */
export function summarizeDays(punches, now = Date.now()) {
  const by = new Map()
  for (const p of punches) {
    const k = p.day || dayKey(p.at)
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(p)
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, list]) => summarizeDay(day, list, now))
}
/**
 * The weekly offs, read the way the server reads `weeklyOff`
 * (attendance_recompute_day): Sunday when it is not set, no day at all when it
 * is set to an empty list. Every screen goes through this so none guesses.
 */
export const weeklyOffOf = (s = {}) => (Array.isArray(s.weeklyOff) ? s.weeklyOff : [0])
/**
 * The shift start to count a day's hours from (an "HH:MM" IST wall time), or
 * undefined on a day with no shift to be early for: a weekly off, a holiday, or
 * no shift set. Passed to summarizeDay (and the phone's workedMs) so every
 * screen agrees with attendance_recompute_day (0056).
 */
export function countFromFor(s, day, holiday = false) {
  if (holiday) return undefined
  if (weeklyOffOf(s).includes(dayOfWeek(day))) return undefined
  const start = s.shift?.start
  return start && /^\d{1,2}:\d{2}$/.test(start) ? start.padStart(5, "0") : undefined
}
/** The latest punch that counts decides whether the person is on duty now. */
export function onDutySince(punches, now = Date.now()) {
  const valid = counted(punches).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const last = valid[0]
  if (!last || last.kind !== "in") return null
  // An in is open only on its own day: at midnight IST an unclosed day resets
  // (migration 0049), exactly as the server decides.
  return dayKey(last.at) === dayKey(now) ? last.at : null
}
export const FLAG_LABEL = {
  offline: "Saved offline",
  clock_skew: "Phone clock was off",
  outside: "Outside the office area",
  low_accuracy: "Weak location",
  mock_location: "Fake location detected",
  no_code: "Marked without scanning a code",
  own_code: "Scanned a code they opened themselves",
  other_site: "Scanned at a station not assigned to them",
  no_checkout: "Did not check out",
  auto_present: "Marked present automatically",
  regularised: "Corrected on request",
  short_hours: "Too few hours",
  worked_off_day: "Worked on a day off",
  half_leave: "Half day on leave",
  worked_on_leave: "Worked while on leave",
}
export const flagWords = (flags) => (flags || []).map((f) => FLAG_LABEL[f] || f)
export const REVIEW_LABEL = {
  ok: "Recorded",
  flagged: "Needs review",
  accepted: "Accepted",
  rejected: "Not accepted",
}
/** One line for the result screen, from the server's answer. */
export function resultSentence(r) {
  if (r.status === "ok" || r.status === "flagged") {
    const verb = r.kind === "out" ? "Clocked out" : "Clocked in"
    const at = r.at ? ` at ${clockIST(r.at)}` : ""
    const where = r.mode === "field" ? " · Field visit" : r.site ? ` · ${r.site}` : ""
    const flagged = r.status === "flagged" ? `. Sent for review: ${flagWords(r.flags).join(", ").toLowerCase()}` : ""
    return `${verb}${at}${where}${flagged}`
  }
  return r.message || "That did not go through. Try again."
}
/**
 * Whether a refusal is worth pointing the camera again for. A dead code means
 * "look up, the screen has a new one"; being already clocked in does not, and
 * offering Scan again there would just walk the person into the same wall.
 */
export const canRescan = (status) =>
  status === "wrong_code" || status === "used_code" || status === "expired_code" || status === "no_code"
/** The Super Admin's override wins over the computed status. */
export const effectiveStatus = (d) => d.override_status || d.status
/**
 * A late mark that counts, the rule attendance_month_summary() applies (0068):
 * the row is late, its EFFECTIVE status is P, OD or HD, and it was not marked
 * present automatically. A day overridden to A or L after it was computed can
 * still carry late = true; it is not a late.
 */
export const countsAsLate = (d) =>
  !!d.late && ["P", "OD", "HD"].includes(effectiveStatus(d)) && !d.flags?.includes("auto_present")
/**
 * A day left open and still held against the person: checked in, never out.
 * Since 0056 the server writes it as A flagged no_checkout (MP before that,
 * still on older rows). Only a day whose EFFECTIVE status is still A or MP
 * counts: an override to a paid status, or autoPresent lifting it to P (flags
 * no_checkout + auto_present), means payroll pays it and nobody needs to chase it.
 */
export const missedCheckout = (d) => {
  const s = effectiveStatus(d)
  return (s === "A" || s === "MP") && (d.status === "MP" || !!d.flags?.includes("no_checkout"))
}
export const STATUS_LABEL = {
  P: "Present",
  HD: "Half day",
  A: "Absent",
  OD: "On duty",
  WO: "Weekly off",
  H: "Holiday",
  MP: "Missed punch",
  L: "Leave",
  LOP: "Loss of pay",
}
/** The console's and the phone's status tone names (emerald/amber/rose/…). */
export const STATUS_TONE = {
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
/**
 * A month of days → the figures payroll reads. The SAME formula as the
 * database's attendance_month_summary(): P + OD + WO + H + L, plus half of each
 * HD and MP, less every `lateRule.count` lates × `lateRule.deductDays`.
 */
export function monthTotals(days, lateRule = {}) {
  const counts = { P: 0, HD: 0, A: 0, OD: 0, WO: 0, H: 0, MP: 0, L: 0, LOP: 0 }
  let lates = 0
  let workedMin = 0
  for (const d of days) {
    counts[effectiveStatus(d)] += 1
    if (countsAsLate(d)) lates += 1
    workedMin += d.worked_min || 0
  }
  const per = Math.max(1, lateRule.count ?? 3)
  const latePenalty = Math.floor(lates / per) * (lateRule.deductDays ?? 0.5)
  const payable = Math.max(
    0,
    counts.P + counts.OD + counts.WO + counts.H + counts.L + 0.5 * (counts.HD + counts.MP) - latePenalty
  )
  return { counts, lates, latePenalty, workedMin, payable }
}
/**
 * The month as calendar weeks, Monday first, padded with the neighbouring
 * months' dates (inMonth false) so every row has seven cells.
 */
export function monthGrid(year, month, days) {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const inMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells = []
  const total = Math.ceil((lead + inMonthDays) / 7) * 7
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 + i - lead))
    const key = d.toISOString().slice(0, 10)
    const inMonth = d.getUTCMonth() === month - 1
    cells.push({ day: key, date: d.getUTCDate(), inMonth, entry: inMonth ? byDay.get(key) ?? null : null })
  }
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
/** "September 2026" and its first/last day, for a month switcher. */
export function monthBounds(year, month) {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, "0")
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
    label: `${names[month - 1]} ${year}`,
  }
}
export const REGULARISATION_LABEL = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
}
export const LEAVE_STATUS_LABEL = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
}
export const LEAVE_STATUS_TONE = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
  cancelled: "slate",
}
export const LEDGER_REASON_LABEL = {
  accrual: "Accrued",
  grant: "Granted",
  taken: "Taken",
  reversal: "Given back",
  lapse: "Lapsed",
  adjust: "Adjusted",
}
const dayOfWeek = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
/**
 * Leave days between two dates, the way the server counts them
 * (leave_days_between, migration 0036): weekly offs and holidays are not leave,
 * unless the sandwich rule is on and they sit strictly inside the range; a
 * half day takes 0.5 off the first and/or last day. For the Apply screen's
 * live count; the server's count is the one that is saved.
 */
export function leaveDaysBetween(from, to, fromHalf, toHalf, rules = {}) {
  if (!from || !to || to < from) return 0
  const off = new Set(weeklyOffOf(rules))
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
export const daysWords = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 || n === 0.5 ? "day" : "days"}`
/** What is left of a balance after a request, for "balance after this request". */
export const balanceAfter = (b, days) => (b.accrual === "none" ? null : Math.round((b.available - days) * 10) / 10)
