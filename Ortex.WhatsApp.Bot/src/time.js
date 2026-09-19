// Wall-clock helpers in the business's time zone (config.timezone, IST by
// default). The PC the bot runs on may be set to anything; the digest must go
// at 9 am in Delhi regardless.

export function zoned(now, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long", hourCycle: "h23",
    }).formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  )
  const h = Number(parts.hour)
  const m = Number(parts.minute)
  const s = Number(parts.second)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, weekday: parts.weekday, h, m, s }
}

export const dayLabel = (ts, tz) =>
  new Date(ts).toLocaleDateString("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })

export const shortDate = (ts, tz) =>
  new Date(ts).toLocaleDateString("en-IN", { timeZone: tz, day: "numeric", month: "short" })

export const clock = (ts, tz) =>
  new Date(ts).toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" })

// "HH:MM" strings compare correctly as strings because both are zero-padded.
export function inQuietHours(hhmm, quiet) {
  if (!quiet?.from || !quiet?.to || quiet.from === quiet.to) return false
  return quiet.from < quiet.to ? hhmm >= quiet.from && hhmm < quiet.to : hhmm >= quiet.from || hhmm < quiet.to
}
