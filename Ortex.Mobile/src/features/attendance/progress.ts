// The live progress display (Zoho People style), the pure half: how much of the
// shift is done, the day as a timeline bar, and the week as columns. Phone-only
// and kept out of domain/attendance.ts (which is mirrored to the console).
// Everything takes `now`, so the tests are not a race with the clock.

import { counted, dayKey, type AttendanceDay, type Punch } from "@/domain/attendance"

const MINUTE = 60000
const DEFAULT_SHIFT_MIN = 9 * 60

export type ShiftSettings = {
  shift?: { start?: string; end?: string }
  graceMin?: number
  saturday?: "full" | "half" | string
}

const hhmmOk = (s?: string) => !!s && /^\d{1,2}:\d{2}$/.test(s)
const minutesOf = (s: string) => {
  const [h, m] = s.split(":").map(Number)
  return h * 60 + m
}

/** The IST weekday of a day key: 0 = Sunday. */
export const istWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()

/**
 * The shift's length in minutes on a given day: from the Super Admin's start and
 * end, halved on a Saturday set to half day, 9 hours when nothing is set.
 */
export function shiftMinutes(s: ShiftSettings, day: string): number {
  let min = DEFAULT_SHIFT_MIN
  if (hhmmOk(s.shift?.start) && hhmmOk(s.shift?.end)) {
    min = minutesOf(s.shift!.end!) - minutesOf(s.shift!.start!)
    if (min <= 0) min += 24 * 60
  }
  if (istWeekday(day) === 6 && s.saturday === "half") min = min / 2
  return min
}

/** An IST wall time on a day → epoch ms. */
export const istMs = (day: string, hhmm: string) => new Date(`${day}T${hhmm.padStart(5, "0")}:00+05:30`).getTime()

/**
 * Worked milliseconds on a day: each in → the out after it, an open in running
 * to `now`. The same pairing as summarizeDay, to the millisecond, because the
 * live timer shows seconds.
 */
export function workedMs(day: string, punches: Punch[], now: number): { ms: number; openSince: number | null } {
  const list = counted(punches.filter((p) => (p.day || dayKey(p.at)) === day)).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  )
  let ms = 0
  let openAt: number | null = null
  for (const p of list) {
    const t = new Date(p.at).getTime()
    if (p.kind === "in") {
      if (openAt === null) openAt = t
    } else if (openAt !== null) {
      ms += Math.max(0, t - openAt)
      openAt = null
    }
  }
  if (openAt !== null) ms += Math.max(0, now - openAt)
  return { ms, openSince: openAt }
}

/** "3h 20m to go" · "Shift complete" · "Overtime 25m" */
export function progressWords(workedMin: number, shiftMin: number): string {
  const left = Math.round(shiftMin - workedMin)
  const fmt = (m: number) => {
    const h = Math.floor(m / 60)
    const r = m % 60
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`
  }
  if (left > 0) return `${fmt(left)} to go`
  if (left > -1) return "Shift complete"
  return `Overtime ${fmt(-left)}`
}

/** 01:07:42 */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

export type Timeline = {
  /** Axis ends (epoch ms). */
  startMs: number
  endMs: number
  /** Worked stretches as fractions of the axis. */
  segments: { left: number; width: number; open: boolean }[]
  /** Where now is, or null when now is off the axis. */
  now: number | null
  /** The end of the grace period after the shift start. */
  grace: number | null
  /** A late first clock-in: the gap from the grace end to it. */
  late: { left: number; width: number } | null
  /** Where the shift itself starts and ends (the axis may run wider). */
  shiftLeft: number
  shiftRight: number
}

/**
 * The day as a bar: the shift from start to end, stretched to cover any punch
 * outside it (and now, while on duty), each in → out a filled stretch, an open
 * one growing to now, a tick at the end of grace and a late gap in warning.
 */
export function dayTimeline(day: string, punches: Punch[], s: ShiftSettings, now: number): Timeline {
  const start = hhmmOk(s.shift?.start) ? s.shift!.start! : "09:30"
  const end = hhmmOk(s.shift?.end) ? s.shift!.end! : "18:30"
  const shiftStart = istMs(day, start)
  let shiftEnd = istMs(day, end)
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60 * MINUTE
  if (istWeekday(day) === 6 && s.saturday === "half") shiftEnd = shiftStart + (shiftEnd - shiftStart) / 2

  const list = counted(punches.filter((p) => (p.day || dayKey(p.at)) === day)).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  )
  const pairs: { from: number; to: number; open: boolean }[] = []
  let openAt: number | null = null
  for (const p of list) {
    const t = new Date(p.at).getTime()
    if (p.kind === "in") {
      if (openAt === null) openAt = t
    } else if (openAt !== null) {
      pairs.push({ from: openAt, to: t, open: false })
      openAt = null
    }
  }
  if (openAt !== null) pairs.push({ from: openAt, to: Math.max(openAt, now), open: true })

  const times = pairs.flatMap((p) => [p.from, p.to])
  const startMs = Math.min(shiftStart, ...times)
  const endMs = Math.max(shiftEnd, ...times)
  const span = Math.max(1, endMs - startMs)
  const at = (t: number) => Math.min(1, Math.max(0, (t - startMs) / span))

  const graceEnd = shiftStart + (s.graceMin ?? 15) * MINUTE
  const firstIn = pairs[0]?.from
  const isToday = dayKey(now) === day

  return {
    startMs,
    endMs,
    segments: pairs.map((p) => ({ left: at(p.from), width: Math.max(0.004, at(p.to) - at(p.from)), open: p.open })),
    now: isToday && now >= startMs && now <= endMs ? at(now) : null,
    grace: at(graceEnd),
    late: firstIn && firstIn > graceEnd ? { left: at(graceEnd), width: at(firstIn) - at(graceEnd) } : null,
    shiftLeft: at(shiftStart),
    shiftRight: at(shiftEnd),
  }
}

export type WeekColumn = { day: string; label: string; minutes: number; today: boolean; future: boolean }

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Monday of the IST week that contains `now`, as a day key. */
export function weekStart(now: number): string {
  const today = dayKey(now)
  const sinceMonday = (istWeekday(today) + 6) % 7
  return new Date(Date.parse(`${today}T00:00:00Z`) - sinceMonday * 24 * 60 * MINUTE).toISOString().slice(0, 10)
}

/**
 * Monday to Sunday of this week: minutes worked from the day rows, with today's
 * live figure in place of its row (a row lags until the day is recomputed).
 */
export function weekColumns(days: Pick<AttendanceDay, "day" | "worked_min">[], todayLiveMin: number, now: number): WeekColumn[] {
  const monday = weekStart(now)
  const today = dayKey(now)
  const byDay = new Map(days.map((d) => [d.day, d.worked_min || 0]))
  const base = new Date(`${monday}T00:00:00Z`).getTime()
  return WEEKDAY.map((label, i) => {
    const day = new Date(base + i * 24 * 60 * MINUTE).toISOString().slice(0, 10)
    const isToday = day === today
    return {
      day,
      label,
      minutes: isToday ? Math.max(todayLiveMin, byDay.get(day) || 0) : byDay.get(day) || 0,
      today: isToday,
      future: day > today,
    }
  })
}
