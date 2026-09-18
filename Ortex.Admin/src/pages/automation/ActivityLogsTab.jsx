import { useEffect, useMemo, useState } from "react"
import { Card, CardHeader, Badge, PillTabs, Segmented, StatCard } from "../../components/ui/Ui"
import { Users, UserCheck, Flame, RefreshCw } from "../../components/ui/Icons"
import { formatDateTime, relativeTime } from "../../lib/format"
import { repo } from "../../data/store/repository"
import { canAccess } from "../../data/domain/modules"
import { useProfile } from "../../hooks/useProfile"
import { PAGE_SIZE, maskPhone, maskEmail } from "./helpers"
import WindowNotice from "./WindowNotice"
import TablePager from "./TablePager"
import VisitorDrawer, { VisitorIcon } from "./VisitorDrawer"
import {
  buildVisitors, headline, summarise, periodStart,
  INTEREST, PERIODS, VISITOR_FILTERS,
} from "./visitors"

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

const activityTone = (type) =>
  type === "Quote request" ? "amber" :
  type === "Contact form submission" ? "blue" :
  type === "Product search" ? "cyan" : "slate"

const time = (t) => new Date(t).getTime() || 0
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`

const matchesQuery = (a, query) =>
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

// A visitor also matches on who they turned out to be.
const visitorMatches = (v, query) =>
  v.name.toLowerCase().includes(query) ||
  v.leads.some((l) =>
    [l.customer?.name, l.customer?.company, l.customer?.phone, l.customer?.email, l.productInterest]
      .some((f) => (f || "").toLowerCase().includes(query)),
  ) ||
  v.actions.some((a) => matchesQuery(a, query))

const PERIOD_WORDS = { 1: "today", 7: "in the last 7 days", 30: "in the last 30 days", all: "in the loaded history" }

export default function ActivityLogsTab({ activities, totals, activityTruncated, searchQuery, maskSensitiveData, page, onPage }) {
  const profile = useProfile()
  const access = useMemo(
    () => ({ enquiries: canAccess(profile, "enquiries"), voice: canAccess(profile, "voice-leads") }),
    [profile],
  )

  // Enquiries carry the visitor's device id (doc.tracking.userId), which is
  // what turns "Android phone in Rudarpur" into a named lead. Read only when
  // this account may see them; a failure just leaves visitors unnamed.
  const [enquiries, setEnquiries] = useState([])
  useEffect(() => {
    if (!access.enquiries && !access.voice) return
    let live = true
    repo.list("enquiries").then((rows) => live && setEnquiries(rows)).catch(() => {})
    return () => { live = false }
  }, [access.enquiries, access.voice])

  const [view, setView] = useState("visitors")
  const [period, setPeriod] = useState("7")
  const [filter, setFilter] = useState("all")
  const [openId, setOpenId] = useState(null)

  const since = periodStart(period)
  const query = (searchQuery || "").trim().toLowerCase()

  // Visitors are built from ALL loaded actions, so an open visitor shows their
  // whole history; the period decides who is listed (seen since), not what
  // they are shown to have done.
  const allVisitors = useMemo(() => buildVisitors(activities, enquiries), [activities, enquiries])
  const inPeriod = useMemo(
    () => allVisitors.filter((v) => v.lastSeen >= since && (!query || visitorMatches(v, query))),
    [allVisitors, since, query],
  )
  const stats = useMemo(() => summarise(inPeriod), [inPeriod])
  const filterCounts = useMemo(
    () => Object.fromEntries(VISITOR_FILTERS.map((f) => [f.value, inPeriod.filter(f.test).length])),
    [inPeriod],
  )
  const visitors = useMemo(() => {
    const f = VISITOR_FILTERS.find((x) => x.value === filter) || VISITOR_FILTERS[0]
    return inPeriod.filter(f.test)
  }, [inPeriod, filter])

  const rawRows = useMemo(
    () => activities.filter((a) => time(a.timestamp) >= since && (!query || matchesQuery(a, query))),
    [activities, since, query],
  )

  const rows = view === "visitors" ? visitors : rawRows
  // Clamp rather than trust the stored page: a reload or a new search filter can
  // shrink the result set out from under it.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  )

  const open = openId ? allVisitors.find((v) => v.id === openId) || null : null
  const periodWords = PERIOD_WORDS[period]
  const reset = (fn) => (v) => { fn(v); onPage(1) }

  return (
    <div className="space-y-4">
      {activityTruncated && (
        <WindowNotice shown={activities.length} total={totals.user_activities} what="tracked actions" />
      )}

      <div className="flex flex-wrap items-center gap-[10px]">
        <Segmented
          size="md"
          items={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          value={period}
          onChange={reset(setPeriod)}
        />
        <Segmented
          size="md"
          className="ml-auto"
          items={[
            { value: "visitors", label: "Visitors" },
            { value: "raw", label: "Raw log" },
          ]}
          value={view}
          onChange={reset(setView)}
        />
      </div>

      {view === "visitors" && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Users} label="Visitors" value={stats.total.toLocaleString()} />
            <StatCard icon={UserCheck} label="Sent an enquiry" value={stats.enquired.toLocaleString()} accent="bg-success/12 text-success-text" />
            <StatCard icon={Flame} label="Close to enquiring" value={stats.hot.toLocaleString()} accent="bg-warning/12 text-warning-text" />
            <StatCard icon={RefreshCw} label="Came back" value={stats.returning.toLocaleString()} accent="bg-info/10 text-info-text" />
          </div>

          <PillTabs
            items={VISITOR_FILTERS.map((f) => ({ value: f.value, label: f.label, count: filterCounts[f.value] }))}
            value={filter}
            onChange={reset(setFilter)}
          />

          <Card className="overflow-hidden">
            <CardHeader
              title="Website visitors"
              description={`${plural(visitors.length, "visitor")} ${periodWords}, most recent first. Each is one browser on one device. Click a row to see everything they did.`}
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="mt-head">
                  <tr>
                    <th>Visitor</th>
                    <th>Interest</th>
                    <th>What they did</th>
                    <th>Visits</th>
                    <th>Came from</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody className="mt-body">
                  {visitors.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-muted-foreground">
                        {query ? "No visitor matches that search." : `No visitors ${periodWords}.`}
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((v) => (
                      <tr
                        key={v.id}
                        className="cursor-pointer hover:bg-subtle"
                        onClick={() => setOpenId(v.id)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") setOpenId(v.id) }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex min-w-[220px] items-center gap-3">
                            <VisitorIcon visitor={v} className="h-9 w-9" />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-foreground">{v.name}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {v.lead ? `${v.device}${v.place ? ` · ${v.place}` : ""}` : v.place ? v.device : "Location not shared"}
                                <span className="font-mono"> · {v.id}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={INTEREST[v.interest].tone}>{INTEREST[v.interest].label}</Badge>
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          <div className="truncate text-[13px] text-foreground" title={headline(v)}>{headline(v)}</div>
                          {v.searches.length > 0 && v.products.length > 0 && (
                            <div className="truncate text-[11px] text-muted-foreground">Searched “{v.searches[0].value}”</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                          <div className="text-foreground">{plural(v.visits.length, "visit")}</div>
                          <div className="text-[11px] text-muted-foreground">{plural(v.actions.length, "page")} opened</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] text-foreground">{v.source}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="text-[13px] text-foreground">{relativeTime(v.lastSeen)}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDateTime(v.lastSeen)}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePager page={safePage} pageCount={pageCount} total={rows.length} onPage={onPage} />
          </Card>
        </>
      )}

      {view === "raw" && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Raw activity log"
            description={`${plural(rawRows.length, "tracked action")} ${periodWords}, exactly as the website recorded them.`}
          />
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
                {rawRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-muted-foreground">No activities found.</td>
                  </tr>
                ) : (
                  pagedRows.map((act) => (
                    <tr key={act.id} className="hover:bg-subtle align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium">{formatDateTime(act.timestamp)}</td>
                      {/* The visitor id opens the same visitor view as the Visitors
                          tab; the session is only ever read as "the same tab". */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={() => act.userId && setOpenId(act.userId)}
                        >
                          {act.userId}
                        </button>
                        <div className="font-mono text-[10px] text-muted-foreground">{act.sessionId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={activityTone(act.activityType)}>{act.activityType}</Badge>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {act.metadata?.page && <div className="truncate text-xs font-medium text-foreground">{act.metadata.page}</div>}
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{act.pageUrl}</div>
                        <div className="truncate text-[11px] text-muted-foreground" title={act.referrer || "Direct"}>via {shortReferrer(act.referrer)}</div>
                      </td>
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
          <TablePager page={safePage} pageCount={pageCount} total={rows.length} onPage={onPage} />
        </Card>
      )}

      {open && (
        <VisitorDrawer
          key={open.id}
          visitor={open}
          onClose={() => setOpenId(null)}
          mask={maskSensitiveData}
          access={access}
        />
      )}
    </div>
  )
}
