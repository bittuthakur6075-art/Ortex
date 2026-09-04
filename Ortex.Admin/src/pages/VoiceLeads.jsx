import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Download, Sparkles } from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection } from "../hooks/useCollection"
import { ENQUIRY_STATUS } from "../data/domain/schema"
import { formatDateTime } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader from "../components/layout/PageHeader"
import { Button, EmptyState, PageLoader } from "../components/ui/Ui"
import { buildQuotationState, prettyPhone } from "./voice-leads/helpers"
import { useVoiceCalls } from "./voice-leads/useVoiceCalls"
import VoiceStats from "./voice-leads/VoiceStats"
import CallFilters from "./voice-leads/CallFilters"
import CallCard from "./voice-leads/CallCard"
import CallDrawer from "./voice-leads/CallDrawer"

// Leads captured by Anu, the website AI voice assistant, folded into calls.
// Parsing, grouping and flagging live in ./voice-leads/helpers; this file only
// wires state to the pieces.
export default function VoiceLeads() {
  const { items, loading } = useCollection("enquiries")
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [range, setRange] = useState("all")
  const [view, setView] = useState("all") // all | attention | support
  const [open, setOpen] = useState(null) // phoneKey+endedAt of the expanded call
  const [saving, setSaving] = useState(false)

  const { calls, stats, visible } = useVoiceCalls(items, { query, range, view })

  const active = open ? visible.find((c) => c.id === open) || calls.find((c) => c.id === open) || null : null

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
      <PageHeader
        title="Voice Leads"
        subtitle={
          stats.calls
            ? `${stats.calls} call${stats.calls === 1 ? "" : "s"} from ${stats.callers} caller${stats.callers === 1 ? "" : "s"}, captured by Anu`
            : "Captured by Anu, the AI voice assistant"
        }
      >
        {stats.calls > 0 && (
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </PageHeader>

      {stats.calls > 0 && <VoiceStats stats={stats} />}

      {stats.calls > 0 && (
        <CallFilters
          query={query}
          setQuery={setQuery}
          view={view}
          setView={setView}
          range={range}
          setRange={setRange}
          stats={stats}
          filtering={filtering}
          visibleCount={visible.length}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Sparkles}
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
        saving={saving}
        onClose={() => setOpen(null)}
        onStatus={setStatus}
        onQuotation={toQuotation}
      />
    </div>
  )
}
