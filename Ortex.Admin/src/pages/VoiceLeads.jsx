import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Mic } from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { isAdmin } from "../lib/roles"
import { ENQUIRY_STATUS } from "../data/domain/schema"
import { sameCustomer } from "../data/domain/domain"
import { formatDateTime } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { ExportButton, EmptyState, PageLoader } from "../components/ui/Ui"
import { buildQuotationState, prettyPhone } from "./voice-leads/helpers"
import { useVoiceCalls } from "./voice-leads/useVoiceCalls"
import VoiceStats from "./voice-leads/VoiceStats"
import CallFilters from "./voice-leads/CallFilters"
import CallCard from "./voice-leads/CallCard"
import CallDrawer from "./voice-leads/CallDrawer"
import DeleteCallDialog from "./voice-leads/DeleteCallDialog"

// Leads captured by Anu, the website AI voice assistant, folded into calls.
// Parsing, grouping and flagging live in ./voice-leads/helpers; this file only
// wires state to the pieces.
export default function VoiceLeads() {
  const { items, loading } = useCollection("enquiries")
  const { items: quotations } = useCollection("quotations")
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [range, setRange] = useState("all")
  const [view, setView] = useState("all") // all | attention | support
  const [open, setOpen] = useState(null) // phoneKey+endedAt of the expanded call
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // the call awaiting confirmation
  const profile = useProfile()
  const canDelete = isAdmin(profile)

  const { calls, stats, visible } = useVoiceCalls(items, { query, range, view })
  const location = useLocation()

  // Arriving from a link that names a call to open (the Dashboard's "Needs you
  // today" list). A call id is its newest capture row, as groupIntoCalls sets it.
  useEffect(() => {
    const id = location.state?.openId
    if (!id || loading) return
    if (calls.some((c) => c.id === id)) setOpen(id)
    else toast.error("That call is no longer in the list.")
    navigate(location.pathname + location.search, { replace: true })
  }, [location.state, loading, calls, navigate, location.pathname, location.search])

  const active = open ? visible.find((c) => c.id === open) || calls.find((c) => c.id === open) || null : null

  // Quotations already raised for whoever is on the open call, so the drawer can
  // say so before somebody writes a second one. Scoped to the open call rather
  // than computed for the whole list: this is a per-call fact and the list can
  // run to hundreds of calls.
  const relatedQuotes = useMemo(() => {
    if (!active) return []
    return quotations.filter(
      (q) => active.rows.some((r) => q.enquiryId === r.id) || sameCustomer(active.customer, q.customer),
    )
  }, [quotations, active])

  // Status lives on the underlying enquiry rows. A call can span several rows,
  // so move all of them together, otherwise the fold would keep showing the
  // newest row's status while older siblings disagree in the Enquiries list.
  const setStatus = async (call, status) => {
    setSaving(true)
    try {
      await Promise.all(call.rows.map((r) => repo.update("enquiries", r.id, { status })))
      toast.success(`Marked ${ENQUIRY_STATUS.find((s) => s.id === status)?.label || status}`)
    } catch {
      toast.error("Could not update the status. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Delete a whole folded call. Every capture goes, for the same reason a
  // status change writes to every row: half a conversation left in the table
  // simply reappears as an older call with the same phone number, and the
  // pipeline counts it again. Rows are removed in parallel and the outcome is
  // counted, so a partial failure is reported as a partial failure instead of
  // a success that quietly left rows behind.
  const deleteCall = async () => {
    const call = pendingDelete
    if (!call) return
    setSaving(true)
    try {
      const results = await Promise.allSettled(call.rows.map((r) => repo.remove("enquiries", r.id)))
      const failed = results.filter((r) => r.status === "rejected").length
      if (failed) {
        toast.error(`Deleted ${results.length - failed} of ${results.length} rows. Please try again.`)
      } else {
        toast.success(`Deleted the call from ${call.named ? call.customer.name : "an unnamed caller"}`)
        setOpen(null)
      }
      setPendingDelete(null)
    } catch {
      toast.error("Could not delete the call. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Hand the call to the quotation editor pre-filled. The product and quantity
  // Anu captured seed the first line; the rate is left at zero because a voice
  // call never produces a price worth trusting.
  const toQuotation = (call) => {
    navigate("/quotations", { state: { fromEnquiry: buildQuotationState(call) } })
  }

  const handleExport = () => {
    exportCsv(
      `ortex-voice-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Name", value: (c) => (c.named ? c.customer.name : "") },
        { header: "Phone", value: (c) => prettyPhone(c.customer.phone) },
        { header: "Company", value: (c) => c.customer.company },
        { header: "Address", value: (c) => c.customer.address },
        { header: "Items", value: (c) => c.itemsList.length },
        {
          header: "Order",
          value: (c) => c.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join("; "),
        },
        { header: "Timeline", value: (c) => c.timeline },
        { header: "Summary", value: (c) => c.summary },
        { header: "Status", value: (c) => c.status },
        { header: "Call", value: (c) => `${c.callIndex} of ${c.callTotal}` },
        { header: "Captures", value: (c) => c.captures },
        { header: "Called at", value: (c) => formatDateTime(c.endedAt) },
        { header: "Reference", value: (c) => c.reference },
        { header: "Flags", value: (c) => Object.entries(c.flags).filter(([, v]) => v).map(([k]) => k).join(" ") },
      ],
      visible,
    )
  }

  if (loading) return <PageLoader />

  const filtering = Boolean(query.trim()) || range !== "all" || view !== "all"

  return (
    <div>
      {stats.calls > 0 && <VoiceStats stats={stats} />}

      {stats.calls > 0 && (
        <CallFilters
          query={query}
          setQuery={setQuery}
          view={view}
          setView={setView}
          range={range}
          setRange={setRange}
          actions={<ExportButton onClick={handleExport} />}
          stats={stats}
          filtering={filtering}
          visibleCount={visible.length}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={filtering ? "No calls match this filter" : "No voice leads yet"}
          description={
            filtering
              ? "Try a different search term, another view, or a wider date range."
              : "When Anu captures a customer's details on the website, the summarised call appears here."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((call) => (
            <CallCard key={call.id} call={call} onOpen={setOpen} />
          ))}
        </div>
      )}

      <CallDrawer
        active={active}
        related={relatedQuotes}
        saving={saving}
        onClose={() => setOpen(null)}
        onStatus={setStatus}
        onQuotation={toQuotation}
        onDelete={canDelete ? setPendingDelete : undefined}
      />

      <DeleteCallDialog
        call={pendingDelete}
        busy={saving}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteCall}
      />
    </div>
  )
}
