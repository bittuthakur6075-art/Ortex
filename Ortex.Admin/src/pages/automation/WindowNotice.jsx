import { AlertTriangle } from "../../components/ui/Icons"

// Shown when the loaded window is smaller than the table behind it.
export default function WindowNotice({ shown, total, what }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" />
      <span>
        Showing the most recent <strong className="text-foreground">{shown.toLocaleString()}</strong> of{" "}
        <strong className="text-foreground">{total.toLocaleString()}</strong> {what}. Figures on this page cover the loaded window only.
      </span>
    </div>
  )
}
