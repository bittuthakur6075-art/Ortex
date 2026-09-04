import { AlertTriangle, CalendarClock, Package, Users } from "../../components/ui/Icons"
import { StatCard } from "../../components/ui/Ui"

export default function VoiceStats({ stats }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Users}
        label="Callers"
        value={stats.callers}
        sub={stats.repeat ? `${stats.repeat} called back` : "No repeat calls yet"}
      />
      <StatCard
        icon={CalendarClock}
        label="Last 7 days"
        value={stats.week}
        sub={stats.week ? "Freshest intent, call these first" : "Nothing new this week"}
        accent="bg-emerald-500/14 text-emerald-600"
      />
      <StatCard
        icon={AlertTriangle}
        label="Support issues"
        value={stats.support}
        sub={stats.support ? "Route to support, do not pitch" : "None flagged"}
        accent={stats.support ? "bg-rose-500/12 text-rose-600" : "bg-slate-500/12 text-slate-500"}
      />
      <StatCard
        icon={Package}
        label="Most asked"
        value={
          <span className="block truncate text-lg" title={stats.topProduct}>
            {stats.topProduct || "Not captured"}
          </span>
        }
        sub={stats.topCount ? `${stats.topCount} call${stats.topCount === 1 ? "" : "s"}` : ""}
        accent="bg-amber-500/14 text-amber-600"
      />
    </div>
  )
}
