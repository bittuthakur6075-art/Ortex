import { Badge } from "../../components/ui/Ui"
import { formatDateTime } from "../../lib/format"
import { cn } from "../../lib/cn"

// Every capture Anu saved during the call, newest first.
export default function CallTimeline({ call }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        What Anu heard
        {call.captures > 1 && ` · ${call.captures} updates`}
      </h3>
      {/* Newest first: Anu re-saves as the picture firms up, so the last
          entry is the one that reflects how the call actually ended. */}
      <ol className="space-y-3">
        {call.rows.map((r, i) => (
          <li key={r.id} className="relative border-l border-border pl-4">
            <span
              className={cn(
                "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full",
                i === 0 ? "bg-primary" : "bg-border",
              )}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDateTime(r.createdAt)}</span>
              {i === 0 && call.rows.length > 1 && <Badge tone="blue">Final</Badge>}
              <span className="tabular">{r.reference}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {r.summary || "No summary recorded for this update."}
            </p>
            {/* What this capture actually held, so a product added or
                dropped between captures is visible rather than implied. */}
            {r.itemsList.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {r.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join(" · ")}
              </p>
            )}
            {r.timeline && <p className="mt-0.5 text-xs text-muted-foreground">Timeline: {r.timeline}</p>}
          </li>
        ))}
      </ol>
    </div>
  )
}
