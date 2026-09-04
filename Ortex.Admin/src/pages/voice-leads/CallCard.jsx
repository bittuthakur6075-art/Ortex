import { Building2, CalendarClock, MapPin } from "../../components/ui/Icons"
import { Avatar, Card, StatusBadge } from "../../components/ui/Ui"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { relativeTime, formatDateTime } from "../../lib/format"
import { cn } from "../../lib/cn"
import CallBadges from "./CallBadges"
import ContactRow from "./ContactRow"
import Detail from "./Detail"
import ItemsList from "./ItemsList"
import AiCallButton from "../telecaller/AiCallButton"
import { targetFromVoiceCall } from "../telecaller/helpers"

export default function CallCard({ call, onOpen }) {
  const f = call.flags
  const hasDetail =
    call.itemsList.length || call.timeline || call.customer.address || call.customer.company
  return (
    <Card
      className={cn(
        "flex flex-col p-5 ring-1 transition-shadow hover:shadow-md",
        f.support ? "ring-destructive/30" : "ring-border/60",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={call.named ? call.name : "?"} className={f.support ? "bg-destructive/10 text-destructive-text" : ""} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("truncate font-semibold", call.named ? "text-foreground" : "text-muted-foreground")}>
              {call.name}
            </span>
            <StatusBadge list={ENQUIRY_STATUS} status={call.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CallBadges call={call} flags={f} />
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            {relativeTime(call.endedAt)}
            {call.captures > 1 && ` · ${call.captures} updates during the call`}
          </div>
        </div>
      </div>

      {hasDetail && (
        <div className="mt-4 space-y-2.5 rounded-lg bg-muted/40 p-3">
          <ItemsList items={call.itemsList} dense />
          {(call.timeline || call.customer.company || call.customer.address) && (
            <div className="space-y-2 border-t border-border/60 pt-2.5">
              <Detail icon={CalendarClock} label="Timeline" value={call.timeline} />
              <Detail icon={Building2} label="Company" value={call.customer.company} />
              <Detail icon={MapPin} label="Deliver to" value={call.customer.address} />
            </div>
          )}
        </div>
      )}

      {call.summary && (
        <p className="mt-3 flex-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{call.summary}</p>
      )}

      <div className="mt-4 space-y-2">
        <ContactRow call={call} />
        <div className="flex gap-2">
          <button
            onClick={() => onOpen(call.id)}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Open call
          </button>
          {!f.support && <AiCallButton size="md" target={targetFromVoiceCall(call)} />}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {formatDateTime(call.endedAt)} · {call.reference}
      </div>
    </Card>
  )
}
