import { useMemo, useState } from "react"
import { Phone, Sparkles } from "../components/icons"
import { useCollection } from "../data/hooks"
import { relativeTime, formatDateTime } from "../lib/format"
import PageHeader from "../components/PageHeader"
import { Card, Input, EmptyState, PageLoader } from "../components/ui"

// Leads captured by Anu, the website AI voice assistant. They are stored in the
// shared `enquiries` collection tagged with this source (see Ortex.Web
// LiveOrty saveVoiceLead), so this page is a focused, read-only view of them.
const VOICE_SOURCE = "Voice assistant (Anu)"

export default function VoiceLeads() {
  const { items, loading } = useCollection("enquiries")
  const [query, setQuery] = useState("")

  const leads = useMemo(() => {
    let rows = (items || []).filter((e) => e.source === VOICE_SOURCE)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((e) =>
        [e.reference, e.customer?.name, e.customer?.phone, e.productInterest, e.message]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [items, query])

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Voice Leads" subtitle={`${leads.length} lead${leads.length === 1 ? "" : "s"} captured by Anu, the AI voice assistant`} />

      {leads.length > 0 && (
        <div className="mb-4 max-w-sm">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, product…" />
        </div>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No voice leads yet"
          description="When Anu captures a customer's details on the website, the summarised lead appears here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map((e) => {
            const digits = (e.customer?.phone || "").replace(/\D/g, "")
            return (
              <Card key={e.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-foreground">{e.customer?.name || "Unknown caller"}</div>
                  <span className="flex-none text-xs text-muted-foreground">{relativeTime(e.createdAt)}</span>
                </div>

                {e.customer?.phone && (
                  <a
                    href={digits ? `https://wa.me/${digits}` : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> {e.customer.phone}
                  </a>
                )}

                {e.productInterest && (
                  <div className="mt-2 text-sm text-foreground">
                    <span className="text-muted-foreground">Product: </span>
                    <span className="font-medium">{e.productInterest}</span>
                  </div>
                )}

                {e.message && <p className="mt-1 flex-1 text-sm text-muted-foreground">{e.message}</p>}

                <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)} · {e.reference}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
