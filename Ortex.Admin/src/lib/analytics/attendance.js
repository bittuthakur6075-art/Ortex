// Insights → Attendance, the pure half. Everything here is a function of the
// rows passed in (attendance_days, approved leave_requests, a name map) and of
// `today`, so the page is a thin view and the arithmetic is tested
// (attendance.test.js).
//
// The words the page uses mean one thing each:
//   · a WORKING person-day is one the person was expected to work and did not
//     have off: P, OD, HD, A or MP. Weekly offs, holidays and leave (L, LOP)
//     are not working days, so taking approved leave never lowers a rate;
//   · ATTENDANCE RATE = (P + OD + half of each HD) / working person-days. A
//     missed clock-out (MP) is a working day that earns nothing until corrected;
//   · a WORKED day is P, OD or HD with hours on it; average hours are over those.
// A day's status is the Super Admin's override when there is one.

export const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 }

const WORKING = new Set(["P", "OD", "HD", "A", "MP"])
const PRESENT = new Set(["P", "OD", "HD", "MP"])
const WORKED = new Set(["P", "OD", "HD"])
const LEAVE = new Set(["L", "LOP"])
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const effective = (d) => d.override_status || d.status

export function addDays(iso, n) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

/** The window ending today (inclusive) and the one of the same length before it. */
export function windowFor(range, today) {
  const days = RANGE_DAYS[range] || 30
  const from = addDays(today, -(days - 1))
  return { days, from, to: today, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) }
}

/** Leave taken on a day: its leave_fraction, else a whole day for an L/LOP status. */
export function leaveOn(d) {
  const f = Number(d.leave_fraction)
  if (f > 0) return f
  return LEAVE.has(effective(d)) ? 1 : 0
}

/** The headline figures for a set of day rows. */
export function summarise(rows) {
  let working = 0
  let earned = 0
  let workedDays = 0
  let workedMin = 0
  let presentDays = 0
  let lates = 0
  let missed = 0
  let absent = 0
  let leave = 0
  for (const d of rows) {
    const s = effective(d)
    if (WORKING.has(s)) working += 1
    if (s === "P" || s === "OD") earned += 1
    if (s === "HD") earned += 0.5
    if (PRESENT.has(s)) presentDays += 1
    if (WORKED.has(s) && (d.worked_min || 0) > 0) {
      workedDays += 1
      workedMin += d.worked_min || 0
    }
    if (d.late) lates += 1
    if (s === "MP") missed += 1
    if (s === "A") absent += 1
    leave += leaveOn(d)
  }
  return {
    working,
    rate: working ? Math.round((earned / working) * 1000) / 10 : null,
    avgHours: workedDays ? Math.round((workedMin / workedDays / 60) * 10) / 10 : null,
    lates,
    latePct: presentDays ? Math.round((lates / presentDays) * 100) : null,
    missed,
    absent,
    leave: Math.round(leave * 10) / 10,
    presentDays,
  }
}

/**
 * A change stated in words. `better` says which direction is good, so a rise in
 * lates reads as bad and a rise in the rate as good. `unit` is "points" for a
 * percentage, otherwise the thing counted.
 */
export function changeWords(cur, prev, { noun = "the previous period", unit = "", better = "up", digits = 0 } = {}) {
  if (cur == null || prev == null) return { text: `No figure for ${noun}`, tone: "flat" }
  const diff = Math.round((cur - prev) * 10 ** digits) / 10 ** digits
  if (diff === 0) return { text: `Same as ${noun}`, tone: "flat" }
  const up = diff > 0
  const good = (up && better === "up") || (!up && better === "down")
  const size = Math.abs(diff)
  // A rate moves by points ("higher"/"lower"); a count by things ("more"/"fewer").
  const text =
    unit === "points"
      ? `${size} ${size === 1 ? "point" : "points"} ${up ? "higher" : "lower"} than ${noun}`
      : `${size}${unit ? ` ${unit}` : ""} ${up ? "more" : "fewer"} than ${noun}`
  return { text, tone: good ? "good" : "bad" }
}

/** One point per day: people present, absent and on leave. */
export function dailyTrend(rows, from, to) {
  const by = new Map()
  for (let d = from; d <= to; d = addDays(d, 1)) by.set(d, { day: d, present: 0, absent: 0, leave: 0 })
  for (const r of rows) {
    const p = by.get(r.day)
    if (!p) continue
    const s = effective(r)
    if (PRESENT.has(s)) p.present += 1
    else if (s === "A") p.absent += 1
    if (leaveOn(r) >= 1) p.leave += 1
  }
  return [...by.values()]
}

/** Late marks by weekday, Monday to Saturday. */
export function latesByWeekday(rows) {
  const counts = [0, 0, 0, 0, 0, 0]
  for (const r of rows) {
    if (!r.late) continue
    const dow = new Date(`${r.day}T00:00:00Z`).getUTCDay() // 0 Sun
    if (dow >= 1 && dow <= 6) counts[dow - 1] += 1
  }
  return WEEKDAYS.map((label, i) => ({ label, count: counts[i] }))
}

/** One row per person in the window, sorted by name. */
export function byPerson(rows, names = {}) {
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r.user_id)) groups.set(r.user_id, [])
    groups.get(r.user_id).push(r)
  }
  return [...groups.entries()]
    .map(([userId, list]) => {
      const s = summarise(list)
      return {
        userId,
        name: names[userId]?.name || "Former colleague",
        role: names[userId]?.role || "",
        present: s.presentDays,
        lates: s.lates,
        absent: s.absent,
        missed: s.missed,
        leave: s.leave,
        avgHours: s.avgHours,
        rate: s.rate,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Leave taken in the window by type, from the day rows (so it counts only days inside it). */
export function leaveByType(rows) {
  const by = new Map()
  for (const r of rows) {
    const f = leaveOn(r)
    if (!f) continue
    const code = r.leave_type || (effective(r) === "LOP" ? "LOP" : "L")
    by.set(code, (by.get(code) || 0) + f)
  }
  return [...by.entries()].map(([code, days]) => ({ code, days: Math.round(days * 10) / 10 })).sort((a, b) => b.days - a.days)
}

/** Approved leave starting within `ahead` days, or already running, soonest first. */
export function upcomingLeave(requests, today, ahead = 14) {
  const until = addDays(today, ahead)
  return requests
    .filter((r) => r.status === "approved" && r.to_day >= today && r.from_day <= until)
    .sort((a, b) => (a.from_day < b.from_day ? -1 : a.from_day > b.from_day ? 1 : 0))
}

/** People worth a word, as sentences: 3+ lates or 2+ absences in the window. */
export function needsAttention(people, days) {
  const out = []
  for (const p of people) {
    const bits = []
    if (p.lates >= 3) bits.push(`late ${p.lates} times`)
    if (p.absent >= 2) bits.push(`absent ${p.absent} days`)
    if (!bits.length) continue
    out.push({ userId: p.userId, name: p.name, text: `${p.name} was ${bits.join(" and ")} in the last ${days} days.`, weight: p.lates + p.absent * 2 })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

/**
 * Everything the page draws. `days` must cover both the window and the one
 * before it (prevFrom … to); `requests` are approved leave requests.
 */
export function computeAttendanceInsights({ days = [], requests = [], names = {}, range = "30d", today }) {
  const w = windowFor(range, today)
  const cur = days.filter((d) => d.day >= w.from && d.day <= w.to)
  const prev = days.filter((d) => d.day >= w.prevFrom && d.day <= w.prevTo)
  const now = summarise(cur)
  const before = summarise(prev)
  const people = byPerson(cur, names)
  return {
    window: w,
    now,
    before,
    trend: dailyTrend(cur, w.from, w.to),
    latesByWeekday: latesByWeekday(cur),
    people,
    leaveByType: leaveByType(cur),
    upcoming: upcomingLeave(requests, today),
    attention: needsAttention(people, w.days),
  }
}
