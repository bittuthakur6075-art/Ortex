import { CalendarClock, CheckCircle2, Phone, Trophy } from "../../components/ui/Icons"
import { StatCard } from "../../components/ui/Ui"

export default function TelecallerStats({ stats }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={CalendarClock}
        label="Due now"
        value={stats.due}
        accent={stats.due ? "bg-warning/14 text-warning-text" : "bg-muted text-muted-foreground"}
      />
      <StatCard
        icon={Phone}
        label="Calls, 7 days"
        value={stats.week}
      />
      <StatCard
        icon={Trophy}
        label="Deals closed"
        value={stats.deals}
        accent="bg-success/14 text-success-text"
      />
      <StatCard
        icon={CheckCircle2}
        label="Needs a human"
        value={stats.actions}
        accent={stats.actions ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}
      />
    </div>
  )
}
