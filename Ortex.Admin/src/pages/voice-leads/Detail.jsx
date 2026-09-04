import { cn } from "../../lib/cn"

export default function Detail({ icon: Icon, label, value, className }) {
  if (!value) return null
  return (
    <div className={cn("flex gap-2.5 text-sm", className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    </div>
  )
}
