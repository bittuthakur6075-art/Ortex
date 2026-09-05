import { AlertTriangle, CalendarClock, Package, Users } from "../../components/ui/Icons"
import { StatCard } from "../../components/ui/Ui"

export default function VoiceStats({ stats }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Users}
        label="Callers"
        value={stats.callers}
      />
      <StatCard
        icon={CalendarClock}
        label="Last 7 days"
        value={stats.week}
        accent="bg-success/14 text-success-text"
      />
      <StatCard
        icon={AlertTriangle}
        label="Support issues"
        value={stats.support}
        accent={stats.support ? "bg-destructive/12 text-destructive-text" : "bg-muted text-muted-foreground"}
      />
      <StatCard
        icon={Package}
        label="Most asked"
        value={
          <span className="block truncate text-lg" title={stats.topProduct}>
            {stats.topProduct || "Not captured"}
          </span>
        }
        accent="bg-warning/14 text-warning-text"
      />
    </div>
  )
}
