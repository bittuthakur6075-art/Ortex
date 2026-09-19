// Which scheduled messages are due now. Pure, tested in test/schedule.test.js.
//
// A digest is due once its time has passed today and it has not gone yet
// today, so a PC switched on at 11:00 still sends the 9:00 digest (late rather
// than never), but never during quiet hours: a 9 am digest is not worth waking
// someone at 11 pm for.
import { zoned, inQuietHours } from "./time.js"

export function dueDigests(now, cfg, state) {
  const { date, hhmm, weekday } = zoned(now, cfg.timezone)
  if (inQuietHours(hhmm, cfg.alerts?.quietHours)) return []
  const due = []
  const daily = cfg.digest?.daily
  if (daily && hhmm >= daily && state.lastDaily !== date) due.push("daily")
  const weekly = cfg.digest?.weekly
  if (weekly?.day && weekly?.time && weekday.toLowerCase() === weekly.day.toLowerCase() && hhmm >= weekly.time && state.lastWeekly !== date) {
    due.push("weekly")
  }
  return due
}

export function alertsHeld(now, cfg, state) {
  if (state.mutedUntil && now < new Date(state.mutedUntil).getTime()) return "muted"
  if (inQuietHours(zoned(now, cfg.timezone).hhmm, cfg.alerts?.quietHours)) return "quiet"
  return null
}
