// Attendance, the pure half (docs/pm/ATTENDANCE_LEAVE_PLAN.md). MIRRORED
// line for line from Ortex.Mobile/src/domain/attendance.ts (generated with tsc): edit both.
//
// The server (migration 0033, attendance_punch) is the authority on distance,
// time and whether a punch counts. These functions only turn its rows and its
// answers into what a person reads: a day's first in and last out, the hours in
// between, the flags in words, and a sentence for every refusal. Everything
// takes `now` so a test is not a race with the clock.
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
/** One day's punches (any order) → what the day looked like. */
export function summarizeDay(day, punches, now = Date.now()) {
  const all = [...punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const valid = counted(all)
  let worked = 0
  let openAt = null
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
export function summarizeDays(punches, now = Date.now()) {
  const by = new Map()
  for (const p of punches) {
    const k = p.day || dayKey(p.at)
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(p)
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, list]) => summarizeDay(day, list, now))
}
/** The latest punch that counts decides whether the person is on duty now. */
export function onDutySince(punches, now = Date.now()) {
  const valid = counted(punches).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const last = valid[0]
  if (!last || last.kind !== "in") return null
  // The server treats an in older than 20 hours as closed; so do we.
  return now - new Date(last.at).getTime() < 20 * 60 * MINUTE ? last.at : null
}
export const FLAG_LABEL = {
  offline: "Saved offline",
  clock_skew: "Phone clock was off",
  outside: "Outside the office area",
  low_accuracy: "Weak location",
  mock_location: "Fake location detected",
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
    const where =
      r.mode === "field"
        ? " · Field visit"
        : r.site
        ? ` · ${r.site}${r.distanceM != null ? ` · ${Math.round(r.distanceM)} m` : ""}`
        : ""
    const flagged = r.status === "flagged" ? `. Sent for review: ${flagWords(r.flags).join(", ").toLowerCase()}` : ""
    return `${verb}${at}${where}${flagged}`
  }
  return r.message || "That did not go through. Try again."
}
/** How far outside the fence a check reading is, for the "you are outside" state. */
export function metresOutside(c) {
  if (c.distanceM == null || c.radiusM == null) return 0
  return Math.max(0, Math.round(c.distanceM - c.radiusM))
}
/** Where a selfie goes in the private bucket: <uid>/<yyyy>/<mm>/<punch-id>.jpg */
export function selfiePath(userId, punchId, at = Date.now()) {
  const d = new Date(new Date(at).getTime() + IST_OFFSET_MIN * MINUTE)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${userId}/${yyyy}/${mm}/${punchId}.jpg`
}
