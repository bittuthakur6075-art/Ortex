import { useMemo } from "react"
import { Card, CardHeader, Badge } from "../../components/ui/Ui"
import { formatDateTime } from "../../lib/format"
import { PAGE_SIZE, maskPhone, maskEmail } from "./helpers"
import WindowNotice from "./WindowNotice"
import TablePager from "./TablePager"

// A referrer is only ever read as "where did they come from". The full URL
// (often 90 characters of UTM) crowded out the rest of the row, so we show the
// host and keep the whole thing in the title attribute.
const shortReferrer = (ref) => {
  if (!ref || ref === "Direct") return "Direct"
  try {
    const url = new URL(ref)
    const host = url.hostname.replace(/^www\./, "")
    return url.pathname && url.pathname !== "/" ? host + url.pathname : host
  } catch {
    return ref
  }
}

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

  if (items.length === 0) return <span className="text-muted-foreground">-</span>
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
// unrecognised address, inventing a location for real visitors and presenting
// the guess as fact. Rows with no geolocation now say so.
const renderLocation = (act) => {
  const pin = act.postal ? ` ${act.postal}` : ""
  if (act.location) return act.location + pin
  if (act.city && act.country) return `${act.city}, ${act.country}` + pin
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
      (a.metadata?.searchQuery || "").toLowerCase().includes(query) ||
      (a.metadata?.page || "").toLowerCase().includes(query) ||
      (a.pageUrl || "").toLowerCase().includes(query)
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
      <CardHeader title="User activity" description={`${filteredActivities.length} tracked ${filteredActivities.length === 1 ? "action" : "actions"}`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th>When</th>
              <th>Visitor</th>
              <th>Activity</th>
              <th>Page</th>
              <th>Where from</th>
              <th>Device</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {filteredActivities.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-12 text-center text-muted-foreground">No activities found.</td>
              </tr>
            ) : (
              pagedActivities.map((act) => (
                <tr key={act.id} className="hover:bg-subtle align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-medium">
                    {formatDateTime(act.timestamp)}
                  </td>
                  {/* Who: the visitor id is the join key Growth uses, the session
                      is only ever read as "the same visit", so it rides beneath. */}
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-primary">{act.userId}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{act.sessionId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={
                      act.activityType === "Quote request" ? "amber" :
                      act.activityType === "Contact form submission" ? "blue" :
                      act.activityType === "Product search" ? "cyan" : "slate"
                    }>
                      {act.activityType}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {act.metadata?.page && <div className="truncate text-xs font-medium text-foreground">{act.metadata.page}</div>}
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{act.pageUrl}</div>
                    <div className="truncate text-[11px] text-muted-foreground" title={act.referrer || "Direct"}>via {shortReferrer(act.referrer)}</div>
                  </td>
                  {/* Where: the place, then the address it was resolved from. Both
                      answer one question, so they are one column. */}
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="text-xs text-foreground">{renderLocation(act)}</div>
                    {act.ipAddress && <div className="truncate font-mono text-[10px] text-muted-foreground">{act.ipAddress}{act.isp ? ` · ${act.isp}` : ""}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <div className="text-foreground">{act.device || "Unknown"}</div>
                    <div className="text-[11px] text-muted-foreground">{[act.operatingSystem, act.browser].filter(Boolean).join(" / ") || "Unknown"}</div>
                  </td>
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
