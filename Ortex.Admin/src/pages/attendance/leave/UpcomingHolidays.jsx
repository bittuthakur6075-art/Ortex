import { Card, CardHeader } from "../../../components/ui/Ui"
import { cn } from "../../../lib/cn"
import { todayIST } from "../../../services/attendance"

// The next few holidays as calendar leaves. Everyone may read the holidays
// table (migration 0034), so this sits on My leave for every role as well as
// beside the team's Leave calendar.

/** Whole days from one ISO day to another. */
function inDays(from, to) {
  const utc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((utc(to) - utc(from)) / 86400000)
}

export default function UpcomingHolidays({ holidays, className }) {
  const today = todayIST()
  const upcoming = (holidays || []).filter((h) => h.day >= today).slice(0, 6)

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader title="Upcoming holidays" />
      {upcoming.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">None added yet. Admins add them under Attendance, Holidays.</p>
      ) : (
        <ul className="border-t border-border">
          {upcoming.map((h, i) => {
            const [y, m, d] = h.day.split("-").map(Number)
            const date = new Date(Date.UTC(y, m - 1, d))
            const soon = inDays(today, h.day)
            return (
              <li key={h.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                {/* A small calendar leaf: month over date; the next holiday in brand. */}
                <span
                  className={cn(
                    "squircle grid w-11 flex-none place-items-center rounded-[10px] py-1 leading-none",
                    i === 0 ? "bg-primary/10 text-primary" : "bg-subtle text-foreground",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
                  <span className="mt-1 text-[17px] font-semibold tabular">{d}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground" title={h.name}>{h.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {date.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}
                    {y !== Number(today.slice(0, 4)) ? ` ${y}` : ""}
                  </span>
                </span>
                <span className={cn("flex-none whitespace-nowrap text-[12px] tabular", soon <= 7 ? "font-medium text-primary" : "text-muted-foreground")}>
                  {soon === 0 ? "Today" : soon === 1 ? "Tomorrow" : `in ${soon} days`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
