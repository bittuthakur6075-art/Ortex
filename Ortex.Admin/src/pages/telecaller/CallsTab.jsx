import { useMemo, useState } from "react"
import { Phone, Search } from "../../components/ui/Icons"
import { Avatar, Badge, Card, Chip, EmptyState, Input } from "../../components/ui/Ui"
import { TELECALL_OUTCOMES } from "../../data/domain/schema"
import { relativeTime } from "../../lib/format"
import { cn } from "../../lib/cn"
import { ACTION_OUTCOMES, duration, kindMeta, outcomeMeta, prettyPhone } from "./helpers"

// Every dial the agent has made, newest first. Click a row for the transcript
// and analysis. The "Needs a human" filter is the daily worklist: closes to
// invoice, quotes to send, complaints to pick up.
export default function CallsTab({ calls, onOpen }) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState("all")

  const visible = useMemo(() => {
    let rows = [...calls].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (view === "action") rows = rows.filter((c) => ACTION_OUTCOMES.has(c.analysis?.outcome) && !c.handled)
    else if (view !== "all") rows = rows.filter((c) => c.analysis?.outcome === view)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) =>
        [c.contactName, c.phone, c.analysis?.summary, c.transcriptText, c.kind]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    return rows
  }, [calls, query, view])

  const counts = useMemo(() => {
    const c = { action: 0 }
    for (const x of calls) {
      const o = x.analysis?.outcome
      if (o) c[o] = (c[o] || 0) + 1
      if (ACTION_OUTCOMES.has(o) && !x.handled) c.action += 1
    }
    return c
  }, [calls])

  if (!calls.length) {
    return <EmptyState icon={Phone} title="No calls yet" description="Transcripts and outcomes appear here after the agent's first call." />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative mr-2 w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <Input className="pl-8" placeholder="Search name, phone, summary, transcript…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Chip active={view === "all"} onClick={() => setView("all")}>All ({calls.length})</Chip>
        <Chip active={view === "action"} onClick={() => setView("action")}>Needs a human ({counts.action})</Chip>
        {TELECALL_OUTCOMES.filter((o) => counts[o.id]).map((o) => (
          <Chip key={o.id} active={view === o.id} onClick={() => setView(o.id)}>{o.label} ({counts[o.id]})</Chip>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => {
          const o = outcomeMeta(c.status === "completed" ? c.analysis?.outcome : c.status === "failed" ? "failed" : "")
          const k = kindMeta(c.kind)
          const live = ["dialing", "ringing", "in_progress"].includes(c.status)
          return (
            <Card
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}
              className={cn("cursor-pointer p-4 ring-1 ring-border/60 transition-shadow hover:shadow-md", live && "ring-warning/40")}
            >
              <div className="flex items-start gap-3">
                <Avatar name={c.contactName || "?"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-foreground">{c.contactName || prettyPhone(c.phone)}</span>
                    <Badge tone={k.tone}>{k.label}</Badge>
                    {live ? <Badge tone="amber">{c.status.replace(/_/g, " ")}</Badge> : o.id && <Badge tone={o.tone}>{o.label}</Badge>}
                    {c.simulated && <Badge tone="slate">simulated</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(c.createdAt)} · {duration(c.durationSec)}{c.analysis?.interest != null ? ` · interest ${c.analysis.interest}/10` : ""}
                  </div>
                </div>
              </div>
              {(c.analysis?.summary || c.error) && (
                <p className={cn("mt-3 line-clamp-3 text-sm leading-relaxed", c.error ? "text-destructive-text" : "text-muted-foreground")}>
                  {c.error || c.analysis.summary}
                </p>
              )}
              {c.analysis?.nextAction && (
                <p className="mt-2 line-clamp-2 text-xs font-medium text-foreground">Next: {c.analysis.nextAction}</p>
              )}
            </Card>
          )
        })}
      </div>
      {!visible.length && <p className="py-8 text-center text-sm text-muted-foreground">No calls match.</p>}
    </div>
  )
}
