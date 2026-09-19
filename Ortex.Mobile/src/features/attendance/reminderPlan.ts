// Which clock-in / clock-out reminders to schedule, as a pure function
// (lib/attendanceReminders.ts does the scheduling). Tested in
// test/attendanceReminders.test.mjs.
//
// A reminder is for a WORKING day: never on a weekly off, a holiday, or a day
// fully covered by approved leave. A half day of leave keeps the reminder for
// the half being worked (the morning-leave half shifts the clock-in reminder to
// the afternoon start, which is the shift's midpoint).

export type ReminderRules = {
  shiftStart?: string // "09:30"
  shiftEnd?: string // "18:30"
  graceMin?: number
  weeklyOff?: number[] // 0 = Sunday
  saturday?: "full" | "half"
  holidays?: string[] // YYYY-MM-DD
  /** Approved leave: whole or half days. */
  leave?: { from: string; to: string; fromHalf?: "full" | "second"; toHalf?: "full" | "first" }[]
}

export type PlannedReminder = { kind: "in" | "out"; day: string; at: number }

const IST_MS = 330 * 60000
const DAY_MS = 86400000

const toMinutes = (hhmm: string | undefined, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback
}

/** The IST calendar day of a moment. */
export const istDay = (t: number) => new Date(t + IST_MS).toISOString().slice(0, 10)

/** A wall-clock minute of an IST day, as epoch ms. */
export const istAt = (day: string, minutes: number) => Date.parse(`${day}T00:00:00Z`) - IST_MS + minutes * 60000

/**
 * Reminders for the next `days` IST days (today included), later than `now`.
 * The clock-in one fires `graceMin + 5` minutes after the shift starts: after
 * the late mark, so it is a real "you have not clocked in", never a nag.
 */
export function planReminders(rules: ReminderRules, now: number, days = 7): PlannedReminder[] {
  const start = toMinutes(rules.shiftStart, 9 * 60 + 30)
  let end = toMinutes(rules.shiftEnd, 18 * 60 + 30)
  if (end <= start) end += 24 * 60
  const grace = rules.graceMin ?? 15
  const off = new Set(rules.weeklyOff ?? [0])
  const hol = new Set(rules.holidays ?? [])
  const out: PlannedReminder[] = []
  const today = istDay(now)
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10)
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (off.has(dow) || hol.has(day)) continue

    let dayStart = start
    let dayEnd = dow === 6 && rules.saturday === "half" ? start + Math.round((end - start) / 2) : end
    const mid = start + Math.round((end - start) / 2)
    let covered = false
    for (const l of rules.leave ?? []) {
      if (day < l.from || day > l.to) continue
      const morningOff = day === l.from && l.fromHalf === "second" ? false : true
      const afternoonOff = day === l.to && l.toHalf === "first" ? false : true
      if (morningOff && afternoonOff) covered = true
      else if (morningOff) dayStart = mid // on leave in the morning, working from the midpoint
      else if (afternoonOff) dayEnd = Math.min(dayEnd, mid) // working the morning only
    }
    if (covered) continue

    const inAt = istAt(day, dayStart + grace + 5)
    const outAt = istAt(day, dayEnd)
    if (inAt > now) out.push({ kind: "in", day, at: inAt })
    if (outAt > now) out.push({ kind: "out", day, at: outAt })
  }
  return out
}
