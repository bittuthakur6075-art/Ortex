// Date words for the attendance pages, in IST whatever the browser's zone.

/** "12 Sep 2026" (or "Sat, 12 Sep 2026"), from a YYYY-MM-DD day. */
export function dayLabel(day, withWeekday = false) {
  const d = new Date(`${day}T00:00:00+05:30`)
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  })
}
