import { useMemo } from "react"
import { Card, CardHeader, Badge } from "../../components/ui/Ui"
import { CheckCircle2, AlertTriangle } from "../../components/ui/Icons"
import { formatDateTime } from "../../lib/format"
import { PAGE_SIZE, EVENT_TONES } from "./helpers"
import WindowNotice from "./WindowNotice"
import TablePager from "./TablePager"

// The status column used to render a hardcoded "Processed" on every row, so a
// row written as failed or pending still claimed success. Report what the row
// actually says, and say plainly when it says nothing.
const renderStatus = (status) => {
  const value = String(status || "").toLowerCase()
  if (!value) return <span className="text-xs text-muted-foreground">Not recorded</span>
  if (value === "processed" || value === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-text">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Processed
      </span>
    )
  }
  if (value === "failed" || value === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive-text">
        <AlertTriangle className="h-3.5 w-3.5" />
        Failed
      </span>
    )
  }
  return <span className="text-xs font-medium capitalize text-muted-foreground">{value}</span>
}

export default function EventLogsTab({ events, totals, eventTruncated, page, onPage }) {
  const eventPageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE))
  const safeEventPage = Math.min(page, eventPageCount)
  const pagedEvents = useMemo(
    () => events.slice((safeEventPage - 1) * PAGE_SIZE, safeEventPage * PAGE_SIZE),
    [events, safeEventPage]
  )

  return (
    <div className="space-y-3">
    {eventTruncated && (
      <WindowNotice shown={events.length} total={totals.event_logs} what="events" />
    )}
    <Card className="overflow-hidden">
      <CardHeader title="Event logs" description={`${events.length} ${events.length === 1 ? "event" : "events"}`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th>When</th>
              <th>Visitor</th>
              <th>Event</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {events.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-12 text-center text-muted-foreground">No events generated.</td>
              </tr>
            ) : (
              pagedEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-subtle align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(evt.timestamp)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-primary">{evt.userId || "Unknown"}</td>
                  {/* The machine name and the sentence describing it are the same
                      fact twice over, so they share a cell. */}
                  <td className="px-4 py-3">
                    <Badge tone={EVENT_TONES[evt.eventType] || "slate"}>
                      {evt.eventType}
                    </Badge>
                    {evt.description && <div className="mt-1 text-xs text-muted-foreground">{evt.description}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{renderStatus(evt.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePager
        page={safeEventPage}
        pageCount={eventPageCount}
        total={events.length}
        onPage={onPage}
      />
    </Card>
    </div>
  )
}
