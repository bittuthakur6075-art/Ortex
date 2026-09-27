import { useEffect } from "react"
import { CheckCircle2, RecordCircle, X } from "../ui/Icons"
import { cn } from "../../lib/cn"

// A record's journey as a compact horizontal timeline, shared by the lead and
// quotation pages: one Iconsax node per stage on a connecting line, ticked
// when reached, a filled record circle for now, hollow ahead. The date sits
// beside each reached label (full time on hover). `end` closes the line with a
// terminal node (a lost lead, a rejected or lapsed quotation). A node calls
// `onPick(id)` unless `canPick(id)` says otherwise.
//
//   steps   [{ id, label, when }]
//   reached index of the furthest stage reached
//   end     { label, tone: "rose" | "amber", when } or null
export function StatusTimeline({ steps, reached, end, onPick, canPick = () => true, label = "Status timeline" }) {
  const nodes = [...steps, ...(end ? [{ id: "__end", label: end.label, when: end.when, end: true }] : [])]
  const time = (ts) => new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/am|pm/i, (m) => m.toLowerCase())
  const day = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  const endTone = end?.tone === "amber" ? "text-warning-text" : "text-destructive-text"

  return (
    <ol className="flex min-w-0 flex-1" aria-label={label}>
      {nodes.map((n, i) => {
        const current = n.end || (!end && i === reached)
        const done = !n.end && i <= reached && !current
        const lineDone = i < reached || (end && i <= reached)
        const pickable = !n.end && onPick && canPick(n.id)
        return (
          <li key={n.id} className="relative min-w-0 flex-1">
            {i < nodes.length - 1 && (
              <span
                className={cn(
                  "absolute left-[20px] right-1 top-[7px] h-0.5 rounded-full",
                  lineDone ? (end && i === reached ? (end.tone === "amber" ? "bg-warning/50" : "bg-destructive/40") : "bg-primary") : "bg-background",
                )}
              />
            )}
            <button
              type="button"
              disabled={!pickable}
              onClick={() => pickable && onPick(n.id)}
              className="group relative flex min-w-0 max-w-full flex-col items-start gap-1 pr-3 text-left disabled:cursor-default"
              title={[pickable && !current ? `Move to ${n.label}` : n.label, n.when && time(n.when)].filter(Boolean).join(" · ")}
            >
              <span className="relative grid h-4 w-4 place-items-center rounded-full bg-card">
                {n.end ? (
                  <X variant="Bold" className={cn("h-[18px] w-[18px]", endTone)} />
                ) : done ? (
                  <CheckCircle2 variant="Bold" className="h-[18px] w-[18px] text-primary" />
                ) : current ? (
                  <RecordCircle variant="Bold" className="h-[18px] w-[18px] text-primary" />
                ) : (
                  <RecordCircle variant="Linear" className={cn("h-[18px] w-[18px] text-subtle-foreground/60", pickable && "group-hover:text-primary/60")} />
                )}
              </span>
              <span className="flex min-w-0 max-w-full items-baseline gap-1.5 text-xs">
                <span className={cn("truncate font-semibold", n.end ? endTone : current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground")}>{n.label}</span>
                {n.when && (done || current) && <span className="flex-none text-[11px] text-muted-foreground">{day(n.when)}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// A white action bar pinned to the bottom of the window (Delete on the left,
// save state and actions on the right). While it is on screen the console's
// own site footer is hidden, so a page never ends in two footers.
export function StickyActionBar({ left, children }) {
  useEffect(() => {
    document.documentElement.classList.add("own-footer")
    return () => document.documentElement.classList.remove("own-footer")
  }, [])
  return (
    <div className="sticky bottom-0 z-20 -mx-6 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-6 py-3 text-xs backdrop-blur">
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
