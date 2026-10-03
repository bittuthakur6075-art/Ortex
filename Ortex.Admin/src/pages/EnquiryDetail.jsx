import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Inbox, ArrowLeft, PhoneOutgoing, MessageCircle, Mail, FileText, MoreHorizontal, Clock, UserCheck, Trash2, ImageIcon, ShieldCheck, Mic, Globe, ArrowRight, Calendar, Pencil, CheckCircle2, AlertTriangle,
} from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection, useSettingsFor } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { isAdmin } from "../lib/roles"
import { ENQUIRY_STATUS, LEAD_SOURCES, PRODUCT_CATEGORIES, QUOTATION_STATUS, newEnquiry } from "../data/domain/schema"
import { sameCustomer } from "../data/domain/domain"
import { enquiryAdvisories } from "../lib/advisories"
import { rfqToQuotationLines } from "../lib/quoteRfq"
import { dueLabel, rupees } from "../lib/salesWork"
import { stateName } from "../lib/gstStates"
import { prettyPhone } from "./voice-leads/helpers"
import { cn } from "../lib/cn"
import AiWriter from "../components/ui/AiWriter"
import AiCallButton from "./telecaller/AiCallButton"
import { RecordActivity } from "../components/ui/RecordActivity"
import { Button, EmptyState, Field, Input, Modal, PageLoader, Select, Textarea } from "../components/ui/Ui"
import { ActionMenu, Initials, StatusDropdown, Tag } from "../components/sales/ListParts"
import { StatusTimeline, StickyActionBar } from "../components/sales/StatusTimeline"
import { Pill } from "./dashboard/parts"
import { buildLead, channelMeta, STATUS_TONE, gstRead, historyWith } from "./leads/model"
import { useLeadActions, useStaffNames, telHref, waHref, mailHref, firstName, contactOf } from "./leads/actions"
import { callContact } from "../components/sales/ContactCard"

const TRACK = ["new", "contacted", "qualified", "quoted", "won"]
const dayMonth = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
const stamp = (ts) =>
  new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/am|pm/i, (m) => m.toLowerCase())

// One lead on its own page (Figma "V2 · Lead detail"): the header says who and
// where it stands, the next action is said once with the buttons to do it, the
// main column is what they asked for and the conversation, the rail is facts.
// Everything writes straight back; there is no Save.
export default function EnquiryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { items, loading } = useCollection("enquiries")
  const { items: products } = useCollection("products")
  const { items: quotations } = useCollection("quotations")
  const { items: invoices } = useCollection("invoices")
  const { items: customers } = useCollection("customers")
  const settingsOf = useSettingsFor()
  // The GST check compares against the enquiry's own company.
  const settings = settingsOf?.(items.find((x) => x.id === id)?.companyId) ?? null
  const profile = useProfile()
  const staff = useStaffNames(profile)
  const actions = useLeadActions({ products, staff, me: profile?.name || "" })
  const [tab, setTab] = useState("overview")
  const [menu, setMenu] = useState(null)
  const [editing, setEditing] = useState(null) // "contact" | "request"
  const [now] = useState(Date.now)

  const enquiry = useMemo(() => items.find((e) => e.id === id) || null, [items, id])
  const l = useMemo(() => (enquiry ? buildLead(enquiry, { products, quotations, now }) : null), [enquiry, products, quotations, now])
  const related = useMemo(() => (enquiry ? quotations.filter((q) => q.enquiryId === enquiry.id || sameCustomer(enquiry.customer, q.customer)) : []), [enquiry, quotations])
  const history = useMemo(() => (enquiry ? historyWith(enquiry.customer, { invoices, quotations, customers }) : null), [enquiry, invoices, quotations, customers])
  const advice = useMemo(() => (l ? enquiryAdvisories(l.e, { rfq: l.rfq, products, related }) : []), [l, products, related])
  const lines = useMemo(() => (l?.items.length ? rfqToQuotationLines(l.items, products) : []), [l, products])
  const anuCalls = useMemo(() => {
    const digits = (enquiry?.customer?.phone || "").replace(/\D/g, "").slice(-10)
    return digits ? items.filter((e) => e.source === "Voice assistant (Anu)" && (e.customer?.phone || "").replace(/\D/g, "").slice(-10) === digits) : []
  }, [items, enquiry])

  // "Next lead" walks the order of the list this page was opened from (its ids
  // arrive as router state); opened from anywhere else, the open leads by due date.
  const listIds = location.state?.ids
  const siblings = useMemo(() => {
    if (Array.isArray(listIds) && listIds.length) {
      const known = new Set(items.map((e) => e.id))
      return listIds.filter((x) => known.has(x)).map((x) => ({ id: x }))
    }
    return items
      .map((e) => buildLead(e, { products: [], quotations: [], now }))
      .filter((x) => x.open)
      .sort((a, b) => a.step.due - b.step.due)
  }, [items, now, listIds])
  // Back returns to the list as it was left (its view and filters are in the
  // URL); a lead opened from a link with no history goes to the Leads list.
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/crm"))

  if (loading) return <PageLoader />
  if (!enquiry || !l) {
    return (
      <EmptyState
        icon={Inbox}
        title="Lead not found"
        description="It may have been deleted, or the link is out of date."
        action={<Button size="sm" onClick={() => navigate("/crm")}>Back to leads</Button>}
      />
    )
  }

  const e = enquiry
  const c = e.customer || {}
  const ch = channelMeta(l.channel)
  const status = e.status || "new"
  const gst = gstRead(c, settings?.company?.stateCode)
  const pos = siblings.findIndex((x) => x.id === e.id)
  const nextSibling = siblings[pos + 1] || siblings[0]
  const lastWin = history?.quotes.filter((q) => ["accepted", "invoiced"].includes(q.status)).sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))[0]
  const ready = l.items.length > 0 && lines.every((ln) => ln.rate > 0) && (!gst || gst.ok)
  const quote = () => actions.quote({ ...e, rfqItems: l.items })

  // Admins only, as on Voice calls. The database (0007 `staff_enquiries`) still
  // lets anyone with the Leads module delete, so this gate is the console's.
  const canDelete = isAdmin(profile)
  const remove = () => actions.confirmDelete([e], () => navigate("/crm", { replace: true }))

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: "Activity", count: (e.activity || []).length },
    { key: "quotations", label: "Quotations", count: related.length },
    l.flags.artwork && { key: "files", label: "Files", count: 1 },
    anuCalls.length > 0 && { key: "anu", label: "Anu calls", count: anuCalls.length },
  ].filter(Boolean)

  return (
    // At least one window tall, so the sticky action bar rests on the bottom
    // edge even when the lead is short (56px header + 20px top padding).
    <div className="flex min-h-[calc(100dvh-76px)] flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <button type="button" onClick={back} aria-label="Back to leads" title="Back to leads" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-line bg-card text-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ArrowLeft variant="Linear" className="h-4 w-4" />
          </button>
          <button type="button" onClick={back} className="hover:text-foreground">Leads</button>
          <span>/</span>
          <span className="font-medium text-foreground">{e.reference || l.name || "Lead"}</span>
        </div>
        {pos >= 0 && siblings.length > 1 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            {pos + 1} of {siblings.length}{listIds ? "" : " open"}
            <button type="button" onClick={() => navigate(`/enquiries/${nextSibling.id}`, { state: location.state, replace: true })} title="Next lead" aria-label="Next lead" className="grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-foreground hover:border-primary/40 hover:text-primary">
              <ArrowRight variant="Linear" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <section className="squircle rounded-card bg-card px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start gap-4">
          <Initials name={l.name} size={52} className="text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold leading-8 tracking-[-0.01em] text-foreground">{l.name || "Unnamed caller"}</h1>
              <button type="button" title={e.starred ? "Remove star" : "Star"} aria-label="Star this lead" aria-pressed={!!e.starred} onClick={() => actions.patch(e, { starred: !e.starred })} className={cn("text-lg leading-none", e.starred ? "text-warning" : "text-muted-foreground hover:text-warning")}>
                ★
              </button>
              <StatusDropdown value={status} statuses={ENQUIRY_STATUS} tones={STATUS_TONE} onChange={(s) => actions.setStatus(e, s)} />
            </div>
            <p className="mt-1 truncate text-[13px] text-muted-foreground">
              {[c.designation, [c.company, c.city].filter(Boolean).join(" · "), `via ${l.flags.quote ? "Website RFQ" : ch.label}`, stamp(e.createdAt || now)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <div className="squircle flex overflow-hidden rounded-xl border border-line">
              <button
                type="button"
                onClick={(ev) => callContact(ev, contactOf(e))}
                disabled={!telHref(c.phone)}
                title="Call"
                aria-label="Call"
                className="grid h-10 w-11 place-items-center bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                <PhoneOutgoing className="h-4 w-4" />
              </button>
              <IconLink icon={MessageCircle} label="WhatsApp" href={waHref(c.phone)} external green className="border-x border-line" />
              <IconLink icon={Mail} label="Email" href={mailHref(c.email)} />
            </div>
            <AiCallButton
              size="md"
              target={{ kind: "followup", phone: c.phone, contactName: c.name || "", company: c.company || "", enquiryId: e.id, source: "enquiries", context: { productInterest: e.productInterest, quantity: e.quantity, summary: e.message } }}
            />
            <Button onClick={quote} disabled={status === "won" || status === "lost"}>
              <FileText className="h-4 w-4" /> Create quotation
            </Button>
            <Button variant="outline" icon onClick={(ev) => setMenu(ev.currentTarget)} aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Status timeline New → Won, with Close as lost beside it */}
        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
          <StatusTimeline
            label="Lead status timeline"
            steps={TRACK.map((s) => ({ id: s, label: ENQUIRY_STATUS.find((x) => x.id === s).label, when: s === "new" ? e.createdAt : e.statusAt?.[s] }))}
            // A lost lead shows the furthest stage it has a date for.
            reached={status === "lost" ? Math.max(0, ...TRACK.map((s, i) => (e.statusAt?.[s] ? i : 0))) : Math.max(0, TRACK.indexOf(status))}
            end={status === "lost" ? { label: `Lost${e.lostReason ? `: ${e.lostReason}` : ""}`, tone: "rose", when: e.statusAt?.lost } : null}
            onPick={(s) => s !== status && actions.setStatus(e, s)}
          />
          {status !== "lost" && (
            <Button variant="dangerTonal" size="sm" className="flex-none" onClick={() => actions.setStatus(e, "lost")}>
              Close as lost
            </Button>
          )}
        </div>
      </section>

      {/* Next action, said once, with the buttons to act on it */}
      {l.step && (
        <section className="squircle relative flex flex-wrap items-center gap-4 overflow-hidden rounded-card bg-card py-4 pl-9 pr-4">
          <span className={cn("absolute bottom-3 left-4 top-3 w-[3px] rounded-full", l.step.overdue ? "bg-destructive" : l.step.today ? "bg-warning" : "bg-primary")} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.06em]", l.step.overdue ? "text-destructive-text" : "text-muted-foreground")}>Next action</span>
              <span className="font-semibold text-foreground">
                {l.step.label}
                {l.name ? ` to ${firstName(l.name)}` : ""} · {dueLabel(l.step.due, now).replace(/^Overdue (.*)/, "$1 overdue")}
                {e.owner ? ` · ${e.owner}` : ""}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {lastWin && (
                <Tag tone="slate" className="h-5 gap-1">
                  <FileText className="h-3 w-3" /> {c.company || firstName(c.name)} accepted {lastWin.number}, {rupees(lastWin.totals?.taxable)}, in {new Date(lastWin.issueDate).toLocaleDateString("en-IN", { month: "short" })}
                </Tag>
              )}
              {ready && (
                <Tag tone="emerald" className="h-5 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Ready to quote: {[l.flags.artwork === "attached" && "artwork", gst?.ok && "GSTIN", "all items in the catalogue"].filter(Boolean).join(", ")}
                </Tag>
              )}
              {!ready && advice[0] && (
                <Tag tone={advice[0].tone === "danger" ? "rose" : "amber"} className="h-auto min-h-5 gap-1 whitespace-normal py-0.5">
                  <AlertTriangle className="h-3 w-3 flex-none" /> {advice[0].text}
                </Tag>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button variant="outline" onClick={(ev) => actions.pickFollowUp(e, ev.currentTarget)}>
              <Clock className="h-4 w-4" /> Snooze
            </Button>
            <Button variant="outline" onClick={(ev) => actions.pickOwner(e, ev.currentTarget)}>
              <UserCheck className="h-4 w-4" /> {e.owner ? "Reassign" : "Assign"}
            </Button>
            <Button onClick={() => (setTab("overview"), document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "center" }), window.dispatchEvent(new CustomEvent("lead-composer", { detail: "call" })))}>
              <PhoneOutgoing className="h-4 w-4" /> Log call
            </Button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 [&>*:first-child]:!mb-0">
          {/* Tabs, attached to the top of the card under them */}
          <div className="squircle flex items-center gap-6 rounded-t-card border-b border-border bg-card px-[18px]">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn("-mb-px flex h-12 items-center gap-2 border-b-2 text-[13px] font-medium", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {t.count > 0 && <span className="rounded-md bg-background px-1.5 text-[11px] text-muted-foreground tabular">{t.count}</span>}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <Box
                attached
                title="What they asked for"
                sub={l.items.length ? "From the website quote builder. Quantities only; rates come from your catalogue." : "As the customer put it. Edit to record what was agreed on the call."}
                action={
                  <>
                    <Button variant="outline" onClick={() => setEditing("request")}>
                      {l.items.length ? "Edit details" : "Edit items"}
                    </Button>
                    <Button onClick={quote} disabled={status === "won" || status === "lost"}>
                      <FileText className="h-4 w-4" /> Turn into quotation
                    </Button>
                  </>
                }
              >
                <AskedTable l={l} lines={lines} gst={gst} />
                {l.flags.artwork && (
                  <div className={cn("squircle mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5", l.flags.artwork === "attached" ? "border-success/30 bg-success/[0.05]" : "border-destructive/30 bg-destructive/[0.05]")}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line bg-card text-[10px] font-semibold text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-foreground">{artworkName(e)}</div>
                      <div className="text-[11px] text-muted-foreground">{l.flags.artwork === "attached" ? "Artwork uploaded with the request" : "The upload failed. Ask them to resend it."}</div>
                    </div>
                  </div>
                )}
                {(l.summary.trim() || l.timeline) && (
                  <div className="squircle mt-3 flex gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-5 text-muted-foreground">
                    {l.flags.voice ? <Mic className="mt-0.5 h-4 w-4 flex-none" /> : <Mail className="mt-0.5 h-4 w-4 flex-none" />}
                    <div className="min-w-0">
                      {l.summary.trim() && <p className="whitespace-pre-wrap">“{l.summary.trim()}”</p>}
                      {l.timeline && <p className="mt-1 text-xs font-medium text-foreground">Timeline: {l.timeline}</p>}
                    </div>
                  </div>
                )}
              </Box>
              <ActivityBox e={e} l={l} related={related} anuCalls={anuCalls} actions={actions} />
            </>
          )}

          {tab === "activity" && (
            <Box attached title="Change history" sub="Who changed this lead, and when.">
              <RecordActivity collection="enquiries" record={e} bare title="" />
            </Box>
          )}

          {tab === "quotations" && (
            <Box attached title="Quotations" sub="Everything quoted to this customer, newest first." action={<Button onClick={quote}>New quotation</Button>}>
              <QuoteList quotes={related} onOpen={(q) => navigate("/quotations", { state: { openId: q.id } })} />
            </Box>
          )}

          {tab === "files" && (
            <Box attached title="Files" sub="Sent with the enquiry.">
              <p className="text-[13px] text-foreground">{artworkName(e)}</p>
            </Box>
          )}

          {tab === "anu" && (
            <Box attached title="Anu calls" sub="Calls from this number to the website assistant." action={<Button variant="outline" onClick={() => navigate("/crm?tab=voice")}>Open Voice calls</Button>}>
              <ul className="divide-y divide-border">
                {anuCalls.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-2.5 text-[13px]">
                    <Mic className="mt-0.5 h-4 w-4 flex-none text-info-text" />
                    <span className="min-w-0 flex-1 text-foreground">{r.message || r.productInterest || "Call captured"}</span>
                    <span className="flex-none text-xs text-muted-foreground">{stamp(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </div>

        {/* Rail */}
        <div className="space-y-4">
          <RailCard title="Contact and GST" action={<TextBtn onClick={() => setEditing("contact")}>Edit</TextBtn>}>
            <Rows>
              <Row label="Phone" value={c.phone ? prettyPhone(c.phone) : null} copy={c.phone} />
              {e.altPhone && <Row label="Alt. mobile" value={prettyPhone(e.altPhone)} copy={e.altPhone} />}
              <Row label="Email" value={c.email} copy={c.email} />
              <Row label="Location" value={l.location || null} />
              {c.address && c.address !== l.location && <Row label="Address" value={<span className="whitespace-normal">{c.address}</span>} />}
              <Row label="GSTIN" value={c.gstin || null} />
            </Rows>
            {gst && (
              <div className={cn("squircle mt-3 flex gap-2 rounded-lg px-3 py-2 text-[11.5px] leading-4", gst.ok ? "bg-success/[0.08] text-success-text" : "bg-warning/10 text-warning-text")}>
                <ShieldCheck className="h-4 w-4 flex-none" />
                {gst.ok
                  ? `Valid · ${stateName(gst.state) || "State"} (${gst.state}). ${gst.inter ? `Interstate from ${stateName(settings?.company?.stateCode) || "your state"}, so IGST.` : "Same state, so CGST plus SGST."}`
                  : "The GSTIN does not match its state code. Check it before quoting."}
              </div>
            )}
          </RailCard>

          <section className="squircle grid grid-cols-2 gap-2 rounded-card bg-card p-4">
            <MiniTile label={l.quote ? "Quoted" : "Est. value"} value={l.value > 0 ? rupees(l.value) : "-"} sub={l.quote ? l.quote.number : "excl. GST"} />
            <MiniTile label="Units" value={l.units ? l.units.toLocaleString("en-IN") : "-"} sub={l.items.length ? `${l.items.length} line${l.items.length === 1 ? "" : "s"}` : e.productInterest || "not given"} />
            <MiniTile label="Age" value={ageText(e, now)} sub={l.step?.overdue ? "overdue" : "since it came in"} danger={l.step?.overdue} />
            <MiniTile label="Buyer" value={history?.invoices.length ? "Repeat" : "New"} sub={history?.invoices.length ? `${history.invoices.length} invoice${history.invoices.length === 1 ? "" : "s"}` : "first order"} good={history?.invoices.length > 0} />
          </section>

          <RailCard title="Lead details">
            <Rows>
              <Row label="Reference" value={e.reference || null} />
              <Row label="Channel" value={<Tag tone="blue" className="h-5 gap-1"><ch.icon className="h-3 w-3" /> {l.flags.quote ? "Website RFQ" : ch.label}</Tag>} />
              <Row label="Product interest" value={e.productInterest || null} />
              <Row label="Quantity" value={l.units ? `${l.units.toLocaleString("en-IN")} units` : l.qtyText || null} />
              {l.timeline && <Row label="Timeline" value={l.timeline} />}
              <Row label="Target rate" value={e.rate ? `₹${e.rate}` : null} />
              <Row label="Owner" value={<TextBtn onClick={(ev) => actions.pickOwner(e, ev.currentTarget)} plain>{e.owner || "Assign"} ⌄</TextBtn>} />
              <Row
                label="Follow-up"
                value={l.step ? <span className={cn(l.step.overdue && "text-destructive-text")}>{dueLabel(l.step.due, now)}</span> : null}
                action={<TextBtn onClick={(ev) => actions.pickFollowUp(e, ev.currentTarget)}>{l.step ? "Change" : "Set"}</TextBtn>}
              />
              <Row
                label="Tags"
                value={
                  <span className="flex flex-wrap gap-1">
                    {history?.invoices.length > 0 && <Tag tone="blue" className="h-5">Repeat buyer</Tag>}
                    {l.flags.artwork === "attached" && <Tag tone="emerald" className="h-5">Artwork</Tag>}
                    {(e.tags || []).map((t) => (
                      <Tag key={t} tone="blue" className="h-5">{t}</Tag>
                    ))}
                    <button type="button" onClick={(ev) => setMenu(ev.currentTarget)} className="h-5 rounded-full border border-line px-2 text-[11px] text-muted-foreground hover:text-primary">+ Add</button>
                  </span>
                }
              />
            </Rows>
          </RailCard>

          {history && (history.quotes.length > 0 || history.invoices.length > 0) && (
            <RailCard title={`History with ${c.company || firstName(c.name) || "this customer"}`} action={history.master && <TextBtn onClick={() => navigate(`/customers/${history.master.id}`)}>Open customer</TextBtn>}>
              <div className="grid grid-cols-3 gap-2">
                <MiniTile label="Lifetime" value={compactRs(history.lifetime)} />
                <MiniTile label="Invoices" value={history.invoices.length} />
                <MiniTile label="Last order" value={history.last ? dayMonth(history.last) : "-"} />
              </div>
              <QuoteList quotes={history.quotes.filter((q) => q.enquiryId !== e.id).slice(0, 3)} onOpen={(q) => navigate("/quotations", { state: { openId: q.id } })} compact />
            </RailCard>
          )}

          {!l.rfq && (
            <Fold title="Internal notes" sub={e.notes?.trim() ? "Private to your team" : "None yet"}>
              <Textarea
                ai={{
                  purpose: "Private internal notes on a sales enquiry: what the customer wants, what was discussed, and the next step for the sales team",
                  context: () => ({ source: e.source, status: e.status, productInterest: e.productInterest, customerMessage: e.message }),
                  maxChars: 600,
                  onApplied: (notes) => repo.update("enquiries", e.id, { notes }),
                }}
                defaultValue={e.notes || ""}
                onBlur={(ev) => ev.target.value !== (e.notes || "") && repo.update("enquiries", e.id, { notes: ev.target.value })}
                placeholder="Enter internal notes"
                rows={4}
              />
            </Fold>
          )}

          {e.tracking && (e.tracking.userId || e.tracking.sessionId || e.tracking.utmSource) && (
            <Fold title="Source and attribution" sub={[e.tracking.utmSource, e.tracking.utmMedium, e.tracking.landingPage].filter(Boolean).join(" · ") || "Website session"}>
              <Rows>
                {Object.entries(e.tracking).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => (
                  <Row key={k} label={k} value={<span className="break-all">{String(v)}</span>} />
                ))}
              </Rows>
            </Fold>
          )}
        </div>
      </div>

      <StickyActionBar
        left={
          canDelete && (
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Delete lead
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> All changes save automatically
        </span>
      </StickyActionBar>

      <ActionMenu open={!!menu} anchor={menu} onClose={() => setMenu(null)} sections={menu ? actions.menu(l, menu) : []} />
      {actions.element}
      <EditModal kind={editing} e={e} onClose={() => setEditing(null)} />
    </div>
  )
}

// ---- main column ----------------------------------------------------------

// `attached` joins the box to the tab bar above it.
function Box({ title, sub, action, attached, children }) {
  return (
    <section className={cn("squircle rounded-card bg-card p-[18px]", attached && "rounded-t-none")}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {action && <div className="flex flex-none items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  )
}

function AskedTable({ l, lines, gst }) {
  const e = l.e
  if (!l.items.length) {
    return (
      <div className="squircle overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[480px] text-left text-[13px]">
          <thead className="v2-head">
            <tr>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Their rate</th>
              <th className="text-right">Est. amount</th>
            </tr>
          </thead>
          <tbody className="v2-body">
            {(l.askedItems.length ? l.askedItems : [{ product: "Not given yet", quantity: "" }]).map((it, i, list) => (
              <tr key={i}>
                <td>
                  <div className="font-medium text-foreground">{it.product}</div>
                  {it.notes && <div className="text-[11px] text-muted-foreground">{it.notes}</div>}
                </td>
                <td className="text-right tabular">{it.quantity || "-"}</td>
                <td className="text-right tabular">{e.rate ? `₹${e.rate}` : "-"}</td>
                <td className="text-right font-semibold tabular">{list.length === 1 && l.value > 0 && !l.quote ? rupees(l.value) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const total = lines.reduce((s, ln) => s + (ln.rate || 0) * (Number(ln.quantity) || 0), 0)
  return (
    <div className="squircle overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead className="v2-head">
          <tr>
            <th>Item</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Catalogue rate</th>
            <th className="text-right">Est. amount</th>
          </tr>
        </thead>
        <tbody className="v2-body">
          {lines.map((ln, i) => {
            const it = l.items[i] || {}
            return (
              <tr key={i}>
                <td>
                  <div className="font-medium text-foreground">{ln.description}</div>
                  <div className="text-[11px] text-muted-foreground">{[it.sku, it.category].filter(Boolean).join(" · ") || "Not in the catalogue"}</div>
                </td>
                <td className="text-right tabular">{Number(ln.quantity || 0).toLocaleString("en-IN")}</td>
                <td className="text-right tabular">{ln.rate ? `₹${ln.rate.toFixed(2)}` : <span className="text-warning-text">No rate</span>}</td>
                <td className="text-right font-semibold tabular">{ln.rate ? rupees(ln.rate * ln.quantity) : "-"}</td>
              </tr>
            )
          })}
          <tr className="bg-muted">
            <td className="font-semibold text-foreground">Estimated total, excl. GST{gst?.ok ? ` (${gst.inter ? "IGST" : "CGST + SGST"} applies)` : ""}</td>
            <td className="text-right font-semibold tabular">{l.units.toLocaleString("en-IN")}</td>
            <td />
            <td className="text-right font-semibold tabular">{rupees(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const COMPOSER = [
  { key: "note", label: "Note", placeholder: "Add a note for the team.", button: "Save" },
  { key: "call", label: "Log call", placeholder: "What was said on the call?", button: "Log call" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "Type the message. It opens in WhatsApp and is logged here.", button: "Open WhatsApp" },
  { key: "followup", label: "Follow-up", placeholder: "What should happen next?", button: "Set follow-up" },
]
const FEED = [
  { key: "all", label: "All" },
  { key: "calls", label: "Calls" },
  { key: "notes", label: "Notes" },
  { key: "system", label: "System" },
]
const KIND = {
  note: { icon: Pencil, tone: "slate", title: "Note", filter: "notes" },
  call: { icon: PhoneOutgoing, tone: "blue", title: "Call logged", filter: "calls" },
  whatsapp: { icon: MessageCircle, tone: "emerald", title: "WhatsApp sent", filter: "calls" },
  followup: { icon: Calendar, tone: "amber", title: "Follow-up set", filter: "notes" },
  anu: { icon: Mic, tone: "violet", title: "Anu call", filter: "calls" },
  system: { icon: Globe, tone: "slate", title: "", filter: "system" },
  quote: { icon: FileText, tone: "blue", title: "", filter: "system" },
}

function ActivityBox({ e, l, related, anuCalls, actions }) {
  const [mode, setMode] = useState("note")
  const [feed, setFeed] = useState("all")
  const [text, setText] = useState("")

  useEffect(() => {
    const on = (ev) => setMode(ev.detail)
    window.addEventListener("lead-composer", on)
    return () => window.removeEventListener("lead-composer", on)
  }, [])

  const entries = useMemo(() => {
    const out = (e.activity || []).map((a) => ({ ...a, kind: a.type }))
    for (const r of anuCalls) if (r.id !== e.id) out.push({ id: r.id, kind: "anu", at: r.createdAt, text: r.message || r.productInterest || "", by: "Anu" })
    for (const q of related) out.push({ id: `q-${q.id}`, kind: "quote", at: q.createdAt || q.issueDate, title: `Quotation ${q.number} ${q.status === "draft" ? "drafted" : q.status}`, text: `${rupees(q.totals?.grandTotal)} incl. GST`, by: q.sellerName })
    out.push({
      id: "received",
      kind: "system",
      at: e.createdAt,
      title: l.flags.quote ? "Quote request received from the website" : l.flags.voice ? "Captured by Anu on a call" : e.imported ? "Imported from a sheet" : `Received · ${e.source || "Direct"}`,
      text: l.items.length ? `${l.items.length} item${l.items.length === 1 ? "" : "s"}${l.flags.artwork === "attached" ? ` · artwork ${artworkName(e)} attached` : ""}` : "",
      by: e.imported ? "Import" : l.channel === "website" ? "Website" : l.flags.voice ? "Anu" : "",
    })
    return out.filter((x) => x.at).sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [e, l, related, anuCalls])

  const shown = feed === "all" ? entries : entries.filter((x) => KIND[x.kind]?.filter === feed)
  const current = COMPOSER.find((m) => m.key === mode)

  const submit = async (ev) => {
    const t = text.trim()
    if (mode === "followup") {
      // The same follow-up menu as Snooze; the note rides along as the next step.
      return actions.pickFollowUp(e, ev?.currentTarget, async (when) => {
        await actions.logActivity(e, "followup", t || `Follow up on ${dayMonth(when)}`, { followUpAt: when, ...(t ? { nextStep: t } : {}) }, "Follow-up set")
        setText("")
      })
    }
    if (!t) return toast.error("Write something first")
    if (mode === "whatsapp") {
      const href = waHref(e.customer?.phone)
      if (!href) return toast.error("No WhatsApp number on this lead")
      window.open(`${href}?text=${encodeURIComponent(t)}`, "_blank", "noopener")
    }
    // A logged call answers the follow-up that was due, as the preview's does.
    await actions.logActivity(e, mode, t, mode === "call" ? { followUpAt: null } : {}, mode === "call" ? "Call logged" : mode === "whatsapp" ? "Logged" : "Note saved")
    setText("")
  }

  return (
    <Box
      title="Activity and conversations"
      sub="The website, Anu's calls, WhatsApp and your team, newest first."
      action={
        <div className="squircle flex rounded-[10px] bg-muted p-0.5">
          {FEED.map((f) => (
            <button key={f.key} type="button" onClick={() => setFeed(f.key)} className={cn("rounded-lg px-2.5 py-1 text-xs", feed === f.key ? "bg-card font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      <div id="composer" className="squircle rounded-xl border border-line">
        <div className="flex gap-4 border-b border-border px-3.5">
          {COMPOSER.map((m) => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} className={cn("-mb-px h-9 border-b-2 text-xs font-medium", mode === m.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 p-3">
          <textarea
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder={current.placeholder}
            rows={text.includes("\n") ? 3 : 1}
            className="min-h-9 min-w-[200px] flex-1 resize-none bg-transparent py-2 text-[13px] text-foreground outline-none placeholder:text-subtle-foreground"
            onKeyDown={(ev) => ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && mode !== "followup" && submit()}
          />
          {mode !== "followup" && (
            <AiWriter
              value={text}
              onApply={setText}
              purpose={mode === "whatsapp" ? "A short, polite WhatsApp message from Ortex Industries sales to this lead" : "A short internal note on a sales lead for the team"}
              context={() => ({ asked: l.asked, quantity: e.quantity, status: e.status, customerMessage: e.message })}
              maxChars={400}
            />
          )}
          <Button size="sm" onClick={submit}>
            {current.button}
          </Button>
        </div>
      </div>

      <ol className="mt-4">
        {shown.map((x, i) => {
          const k = KIND[x.kind] || KIND.system
          return (
            <li key={x.id} className="relative flex gap-3 pb-4">
              {i < shown.length - 1 && <span className="absolute bottom-0 left-[13px] top-7 w-px bg-border" />}
              <span className={cn("relative grid h-7 w-7 flex-none place-items-center rounded-full", toneBg(k.tone))}>
                <k.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[13px] font-semibold text-foreground">{x.title || k.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {stamp(x.at)}
                    {x.by ? ` · ${x.by}` : ""}
                  </span>
                </div>
                {x.text && (
                  <p className={cn("mt-1 whitespace-pre-wrap text-[12.5px] leading-5", x.kind === "anu" ? "squircle rounded-xl bg-info/[0.06] px-3 py-2 text-foreground" : "text-muted-foreground")}>{x.text}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Box>
  )
}

const toneBg = (t) =>
  ({ blue: "bg-primary/10 text-primary", emerald: "bg-success/12 text-success-text", amber: "bg-warning/12 text-warning-text", violet: "bg-info/10 text-info-text" })[t] || "bg-background text-muted-foreground"

function QuoteList({ quotes, onOpen, compact }) {
  if (!quotes.length) return compact ? null : <p className="text-[13px] text-muted-foreground">No quotations yet.</p>
  return (
    <ul className={cn("divide-y divide-border", compact && "mt-3")}>
      {quotes.map((q) => {
        const s = QUOTATION_STATUS.find((x) => x.id === q.status)
        return (
          <li key={q.id}>
            <button type="button" onClick={() => onOpen(q)} className="flex w-full items-center gap-2.5 py-2.5 text-left hover:opacity-80">
              <FileText className="h-4 w-4 flex-none text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">{q.number}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {(q.lines || [])[0]?.description || "No lines"} · {dayMonth(q.issueDate)}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-1">
                <span className="text-[13px] font-semibold text-foreground tabular">{rupees(q.totals?.taxable)}</span>
                {s && <Pill tone={s.tone === "cyan" ? "blue" : s.tone}>{s.label}</Pill>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- rail -----------------------------------------------------------------

function RailCard({ title, action, children }) {
  return (
    <section className="squircle rounded-card bg-card p-[18px]">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Fold({ title, sub, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="squircle rounded-card bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-[18px] py-3.5 text-left" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <ArrowRight className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && <div className="border-t border-border px-[18px] py-3.5">{children}</div>}
    </section>
  )
}

function MiniTile({ label, value, sub, danger, good }) {
  return (
    <div className="squircle min-w-0 rounded-xl bg-muted px-3 py-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("truncate text-[17px] font-semibold leading-6 tabular", danger ? "text-destructive-text" : good ? "text-success-text" : "text-foreground")}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

const Rows = ({ children }) => <dl className="space-y-2.5 text-[12.5px]">{children}</dl>

function Row({ label, value, copy, action }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-[110px] flex-none text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-foreground">{value ?? <span className="text-subtle-foreground">Not given</span>}</dd>
      {copy && (
        <TextBtn onClick={() => navigator.clipboard?.writeText(copy).then(() => toast.success(`${label} copied`))}>Copy</TextBtn>
      )}
      {action}
    </div>
  )
}

const TextBtn = ({ onClick, children, plain }) => (
  <button type="button" onClick={onClick} className={cn("flex-none text-[12.5px] font-medium hover:underline", plain ? "text-foreground" : "text-primary")}>
    {children}
  </button>
)

function IconLink({ icon: Icon, label, href, external, green, className }) {
  return (
    <a
      href={href || undefined}
      title={href ? label : `No ${label.toLowerCase()} on file`}
      aria-label={label}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn("grid h-10 w-11 place-items-center bg-card transition-colors hover:bg-muted", green ? "text-success-text" : "text-muted-foreground", !href && "pointer-events-none opacity-40", className)}
    >
      <Icon className="h-4 w-4" />
    </a>
  )
}

// ---- edit dialogs ---------------------------------------------------------

function EditModal({ kind, e, onClose }) {
  const [form, setForm] = useState(null)
  useEffect(() => {
    if (kind) setForm({ ...newEnquiry(), ...e, customer: { ...newEnquiry().customer, ...e.customer } })
  }, [kind, e])
  if (!kind || !form) return null
  const setC = (k, v) => setForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    const patch =
      kind === "contact"
        ? { customer: form.customer, altPhone: form.altPhone }
        : { productInterest: form.productInterest, quantity: form.quantity, rate: form.rate, message: form.message, source: form.source }
    try {
      await repo.update("enquiries", e.id, patch)
      toast.success("Saved")
      onClose()
    } catch (err) {
      toast.error(err?.message || "Could not save")
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "contact" ? "Contact and GST" : "What they asked for"}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </>
      }
    >
      {kind === "contact" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={form.customer.name} onChange={(ev) => setC("name", ev.target.value)} /></Field>
          <Field label="Company"><Input value={form.customer.company} onChange={(ev) => setC("company", ev.target.value)} /></Field>
          <Field label="Phone"><Input value={form.customer.phone} onChange={(ev) => setC("phone", ev.target.value)} /></Field>
          <Field label="Alternate mobile"><Input value={form.altPhone || ""} onChange={(ev) => set("altPhone", ev.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.customer.email} onChange={(ev) => setC("email", ev.target.value)} /></Field>
          <Field label="City"><Input value={form.customer.city || ""} onChange={(ev) => setC("city", ev.target.value)} /></Field>
          <Field label="GSTIN"><Input value={form.customer.gstin} onChange={(ev) => setC("gstin", ev.target.value.toUpperCase())} placeholder="Enter GSTIN" /></Field>
          <Field label="State code" hint="e.g. 07 Delhi, 27 Maharashtra"><Input value={form.customer.stateCode} onChange={(ev) => setC("stateCode", ev.target.value)} placeholder="Enter state code" /></Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Source">
              <Select value={form.source} onChange={(ev) => set("source", ev.target.value)}>
                {[...new Set([form.source, ...LEAD_SOURCES].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Product interest">
              <Select value={form.productInterest} onChange={(ev) => set("productInterest", ev.target.value)}>
                <option value="">Not set</option>
                {[...new Set([form.productInterest, ...PRODUCT_CATEGORIES].filter(Boolean))].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity"><Input value={form.quantity} onChange={(ev) => set("quantity", ev.target.value)} placeholder="e.g. 5000" /></Field>
            <Field label="Rate" hint="Per piece, as discussed"><Input value={form.rate} onChange={(ev) => set("rate", ev.target.value)} placeholder="e.g. 6.50" /></Field>
          </div>
          <Field label="Message"><Textarea value={form.message} onChange={(ev) => set("message", ev.target.value)} rows={4} /></Field>
        </div>
      )}
    </Modal>
  )
}

// ---- helpers --------------------------------------------------------------

function artworkName(e) {
  try {
    const d = JSON.parse(e.notes || "")
    return d?.artwork?.fileName || d?.artworkError?.fileName || "Artwork"
  } catch {
    return "Artwork"
  }
}

function ageText(e, now) {
  const days = Math.floor((now - new Date(e.createdAt || now)) / 86400000)
  return days < 1 ? "Today" : `${days} day${days === 1 ? "" : "s"}`
}

function compactRs(v) {
  const n = Number(v) || 0
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  return rupees(n)
}

