import { useMemo } from "react"
import { Card, Badge } from "../../components/ui/Ui"
import { CheckCircle2 } from "../../components/ui/Icons"
import { formatDateTime } from "../../lib/format"
import { PAGE_SIZE, EVENT_TONES } from "./helpers"
import WindowNotice from "./WindowNotice"
import TablePager from "./TablePager"

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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>User ID</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {events.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-muted-foreground">No events generated.</td>
              </tr>
            ) : (
              pagedEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-subtle">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(evt.timestamp)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={EVENT_TONES[evt.eventType] || "slate"}>
                      {evt.eventType}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">{evt.userId}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{evt.description}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-success-text font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Processed
                    </span>
                  </td>
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
