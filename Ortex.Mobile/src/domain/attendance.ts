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
