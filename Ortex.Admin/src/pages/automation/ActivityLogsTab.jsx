import { useMemo } from "react"
import { Card, Badge } from "../../components/ui/Ui"
import { formatDateTime } from "../../lib/format"
import { PAGE_SIZE, maskPhone, maskEmail } from "./helpers"
import WindowNotice from "./WindowNotice"
import TablePager from "./TablePager"

const renderMetadata = (act, mask = true) => {
  const meta = act.metadata || {}
  const items = []
  if (act.productId) items.push(`Product ID: ${act.productId}`)
  if (meta.productName) items.push(`Product: ${meta.productName}`)
  if (meta.searchQuery) items.push(`Query: "${meta.searchQuery}"`)
  if (meta.quantity) items.push(`Qty: ${meta.quantity}`)
  if (meta.action) items.push(`Action: ${meta.action}`)
  if (meta.fileName) items.push(`File: ${meta.fileName}`)
  if (meta.customer?.name) items.push(`Name: ${meta.customer.name}`)
  if (meta.customer?.email) items.push(`Email: ${maskEmail(meta.customer.email, mask)}`)
  if (meta.customer?.phone) items.push(`Phone: ${maskPhone(meta.customer.phone, mask)}`)
  if (meta.message) {
    const msg = String(meta.message)
    items.push(`Msg: "${msg.substring(0, 40)}${msg.length > 40 ? '...' : ''}"`)
  }

  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {items.map((item, idx) => (
        <span key={idx} className="bg-muted px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground font-medium">
          {item}
        </span>
      ))}
    </div>
  )
}

// Report only what the tracker actually recorded. This used to fall back to a
// four-entry IP->city table and, failing that, return "Delhi, India" for *any*
// unrecognised address — inventing a location for real visitors and presenting
// the guess as fact. Rows with no geolocation now say so.
const renderLocation = (act) => {
  if (act.location) return act.location
  if (act.city && act.country) return `${act.city}, ${act.country}`
  if (!act.ipAddress || act.ipAddress === "127.0.0.1" || act.ipAddress === "::1") return "Localhost"
  return <span className="text-muted-foreground">Unknown</span>
}

export default function ActivityLogsTab({ activities, totals, activityTruncated, searchQuery, maskSensitiveData, page, onPage }) {
  // Computed Values & Filters
  const filteredActivities = useMemo(() => {
    if (!searchQuery) return activities
    const query = searchQuery.toLowerCase()
    return activities.filter(a =>
      (a.activityType || "").toLowerCase().includes(query) ||
      (a.userId || "").toLowerCase().includes(query) ||
      (a.sessionId || "").toLowerCase().includes(query) ||
      (a.ipAddress || "").includes(query) ||
      (a.location || "").toLowerCase().includes(query) ||
      (a.city || "").toLowerCase().includes(query) ||
      (a.country || "").toLowerCase().includes(query) ||
      (a.referrer || "").toLowerCase().includes(query) ||
      (a.metadata?.productName || "").toLowerCase().includes(query) ||
      (a.metadata?.searchQuery || "").toLowerCase().includes(query)
    )
  }, [activities, searchQuery])

  // Clamp rather than trust the stored page: a reload or a new search filter can
  // shrink the result set out from under it.
  const activityPageCount = Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE))
  const safeActivityPage = Math.min(page, activityPageCount)
  const pagedActivities = useMemo(
    () => filteredActivities.slice((safeActivityPage - 1) * PAGE_SIZE, safeActivityPage * PAGE_SIZE),
    [filteredActivities, safeActivityPage]
  )

  return (
    <div className="space-y-3">
    {activityTruncated && (
      <WindowNotice shown={activities.length} total={totals.user_activities} what="tracked actions" />
    )}
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-subtle text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Activity Type</th>
              <th className="px-4 py-3">Page URL</th>
              <th className="px-4 py-3">Referrer</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Device / OS</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">Metadata / Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border rows-in text-foreground">
            {filteredActivities.length === 0 ? (
              <tr>
                <td colSpan="10" className="py-12 text-center text-muted-foreground">No activities found.</td>
              </tr>
            ) : (
              pagedActivities.map((act) => (
                <tr key={act.id} className="hover:bg-subtle">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-xs">
                    {formatDateTime(act.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-xs text-primary">{act.userId}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{act.sessionId}</td>
                  <td className="px-4 py-3">
                    <Badge tone={
                      act.activityType === "Quote request" ? "amber" :
                      act.activityType === "Contact form submission" ? "blue" :
                      act.activityType === "Product search" ? "cyan" : "slate"
                    }>
                      {act.activityType}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-xs truncate">{act.pageUrl}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{act.referrer || "Direct"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{renderLocation(act)}</td>
                  <td className="px-4 py-3 text-xs">
                    {act.device} ({act.operatingSystem} / {act.browser})
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{act.ipAddress}</td>
                  <td className="px-4 py-3 max-w-md">{renderMetadata(act, maskSensitiveData)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePager
        page={safeActivityPage}
        pageCount={activityPageCount}
        total={filteredActivities.length}
        onPage={onPage}
      />
    </Card>
    </div>
  )
}
