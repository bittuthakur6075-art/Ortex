import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Drawer, Badge, Button } from "../../components/ui/Ui"
import { Smartphone, Monitor, ArrowRight, Copy } from "../../components/ui/Icons"
import { formatDateTime, relativeTime } from "../../lib/format"
import { maskPhone, maskEmail } from "./helpers"
import { INTEREST, formatDuration } from "./visitors"
import { VOICE_SOURCE } from "../voice-leads/helpers"

// Interest -> the tinted well its icon sits in. Semantic tokens only.
const INTEREST_WELL = {
  enquired: "bg-success/12 text-success-text",
  hot: "bg-warning/12 text-warning-text",
  interested: "bg-primary/10 text-primary",
  browsing: "bg-secondary text-secondary-foreground",
}

const STEP_DOT = {
  enquired: "bg-success",
  hot: "bg-warning",
  interested: "bg-primary",
  browsing: "bg-border",
}

// What the salesperson should take from this visitor, in one sentence.
const ADVICE = {
  enquired: "They sent an enquiry. Everything they looked at first is below, so you know what they care about before you call.",
  hot: "They got as far as the quote builder or contact page but did not send anything. No contact details were left, so this is a signal about demand, not someone to call.",
  interested: "They looked at products but did not reach the quote builder.",
  browsing: "They looked around without opening a product.",
}

const VISITS_SHOWN = 8

const clock = (t) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })

export function VisitorIcon({ visitor, className = "h-10 w-10" }) {
  const Icon = visitor.mobile ? Smartphone : Monitor
  return (
    <span className={`inline-grid flex-none place-items-center rounded-full ${INTEREST_WELL[visitor.interest]} ${className}`}>
      <Icon className="h-5 w-5" />
    </span>
  )
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-[13px] text-foreground">{children}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function LeadCard({ lead, mask, access, onOpen }) {
  const voice = lead.source === VOICE_SOURCE
  const canOpen = voice ? access.voice : access.enquiries
  const c = lead.customer || {}
  return (
    <div className="rounded-xl border border-success/30 bg-success/12 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-success-text">
            {voice ? "Spoke to Anu" : "Sent an enquiry"} · {formatDateTime(lead.submittedAt || lead.createdAt)}
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{c.name || c.company || "No name given"}</div>
          {c.company && c.name && <div className="text-[13px] text-muted-foreground">{c.company}</div>}
          <div className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
            {c.phone && <div>{maskPhone(c.phone, mask)}</div>}
            {c.email && <div>{maskEmail(c.email, mask)}</div>}
            {lead.productInterest && <div className="text-foreground">Wants: {lead.productInterest}</div>}
          </div>
        </div>
        {lead.status && <Badge tone="outline" className="capitalize">{lead.status}</Badge>}
      </div>
      {canOpen && (
        <Button size="sm" className="mt-3" onClick={() => onOpen(lead, voice)}>
          Open {voice ? "call" : "enquiry"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export default function VisitorDrawer({ visitor, onClose, mask, access }) {
  const navigate = useNavigate()
  const [allVisits, setAllVisits] = useState(false)
  if (!visitor) return null
  const v = visitor
  const level = INTEREST[v.interest]
  const visits = allVisits ? v.visits : v.visits.slice(0, VISITS_SHOWN)
  const net = v.located?.ipAddress ? [v.located.ipAddress, v.located.isp].filter(Boolean).join(" · ") : ""

  const openLead = (lead, voice) => {
    if (voice) navigate("/crm?tab=voice", { state: { openId: lead.id } })
    else navigate(`/enquiries/${lead.id}`)
  }

  const copyId = () => {
    navigator.clipboard?.writeText(v.id).then(
      () => toast.success("Device ID copied"),
      () => toast.error("Could not copy"),
    )
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-xl"
      title={
        <div className="flex items-center gap-3">
          <VisitorIcon visitor={v} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{v.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={level.tone}>{level.label}</Badge>
              {v.returning && <Badge tone="violet">Came back</Badge>}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <p className="text-[13px] leading-5 text-muted-foreground">{ADVICE[v.interest]}</p>

        {v.leads.length > 0 && (
          <div className="space-y-2.5">
            {v.leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} mask={mask} access={access} onOpen={openLead} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl border border-border p-4">
          <Fact label="First seen">{formatDateTime(v.firstSeen)}</Fact>
          <Fact label="Last seen">{relativeTime(v.lastSeen)} · {formatDateTime(v.lastSeen)}</Fact>
          <Fact label="Visits">{v.visits.length} · {v.actions.length} {v.actions.length === 1 ? "page" : "pages"} opened</Fact>
          <Fact label="First came from">{v.source}</Fact>
          <Fact label="Device">
            {v.device}
            {v.latest.browser && <span className="text-muted-foreground"> · {v.latest.browser}</span>}
          </Fact>
          <Fact label="Location">{v.fullPlace || <span className="text-muted-foreground">Not shared</span>}</Fact>
          {net && <Fact label="Network"><span className="font-mono text-xs">{net}</span></Fact>}
          <Fact label="Device ID">
            <button type="button" onClick={copyId} className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline" title="Copy">
              {v.id}
              <Copy className="h-3.5 w-3.5" />
            </button>
          </Fact>
        </div>

        {(v.products.length > 0 || v.searches.length > 0) && (
          <Section title="What they were interested in">
            <div className="flex flex-wrap gap-1.5">
              {v.products.map((p) => (
                <Badge key={`p:${p.value}`} tone="blue">{p.value}{p.count > 1 ? ` ×${p.count}` : ""}</Badge>
              ))}
              {v.searches.map((s) => (
                <Badge key={`s:${s.value}`} tone="outline">Searched “{s.value}”</Badge>
              ))}
            </div>
          </Section>
        )}

        <Section title={v.visits.length === 1 ? "Their visit" : `Their ${v.visits.length} visits, newest first`}>
          <ol className="space-y-4">
            {visits.map((visit) => (
              <li key={visit.start} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
                  <span className="text-[13px] font-semibold text-foreground">{formatDateTime(visit.start)}</span>
                  <span className="text-xs text-muted-foreground">
                    {visit.steps.length > 1 ? formatDuration(visit.duration) + " · " : ""}from {visit.source}
                  </span>
                </div>
                <ol className="px-4 py-2">
                  {visit.steps.map((step) => (
                    <li key={step.id} className="flex items-start gap-3 py-1.5">
                      <span className="w-16 flex-none pt-px text-xs tabular text-muted-foreground">{clock(step.at)}</span>
                      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${STEP_DOT[step.interest]}`} />
                      <span className={`min-w-0 text-[13px] ${step.interest === "enquired" ? "font-semibold text-foreground" : "text-foreground"}`}>
                        {step.label}
                        {step.count > 1 && <span className="text-muted-foreground"> ×{step.count}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {v.visits.length > VISITS_SHOWN && (
            <Button variant="outline" size="sm" onClick={() => setAllVisits((x) => !x)}>
              {allVisits ? "Show fewer visits" : `Show all ${v.visits.length} visits`}
            </Button>
          )}
        </Section>
      </div>
    </Drawer>
  )
}
