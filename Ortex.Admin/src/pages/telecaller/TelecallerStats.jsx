import { CalendarClock, CheckCircle2, Phone, Trophy } from "../../components/ui/Icons"
import { StatCard } from "../../components/ui/Ui"
import { formatCurrency } from "../../lib/format"

export default function TelecallerStats({ stats }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={CalendarClock}
        label="Due now"
        value={stats.due}
        sub={stats.inFlight ? `${stats.inFlight} on a call · ${stats.upcoming} scheduled` : `${stats.upcoming} scheduled later`}
        accent={stats.due ? "bg-amber-500/14 text-amber-600" : "bg-slate-500/12 text-slate-500"}
      />
      <StatCard
        icon={Phone}
        label="Calls, 7 days"
        value={stats.week}
        sub={stats.week ? `${stats.connectRate}% connected · ${stats.today} today` : "No calls yet"}
      />
      <StatCard
        icon={Trophy}
        label="Deals closed"
        value={stats.deals}
        sub={stats.pipeline ? `${formatCurrency(stats.pipeline, { compact: true })} agreed on calls` : "This week"}
        accent="bg-emerald-500/14 text-emerald-600"
      />
      <StatCard
        icon={CheckCircle2}
        label="Needs a human"
        value={stats.actions}
        sub={stats.avgRating ? `Feedback ${stats.avgRating}/5 avg` : "Quotes, closes and complaints to pick up"}
        accent={stats.actions ? "bg-violet-500/12 text-violet-600" : "bg-slate-500/12 text-slate-500"}
      />
    </div>
  )
}
