import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowDownLeft as Chevron, PhoneOutgoing, MessageCircle, Mail, FileText, Send, Clock, CheckCircle2, ImageIcon, ShieldCheck, Maximize, FileSpreadsheet } from "../../components/ui/Icons"
import { CloseButton } from "../../components/ui/Ui"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { sameCustomer } from "../../data/domain/domain"
import { enquiryAdvisories } from "../../lib/advisories"
import { rfqToQuotationLines } from "../../lib/quoteRfq"
import { dueLabel, rupees, tomorrowAt10, DAY } from "../../lib/salesWork"
import { prettyPhone } from "../voice-leads/helpers"
import { useCollection, useSettings } from "../../hooks/useCollection"
import { ActionMenu, Initials, Tag } from "../../components/sales/ListParts"
import { Dot } from "../dashboard/parts"
import { cn } from "../../lib/cn"
import { channelMeta, STATUS_TONE, gstRead, historyWith } from "./model"
import { telHref, waHref, mailHref, firstName, contactOf } from "./actions"
import { callContact } from "../../components/sales/ContactCard"

const NEXT_STATUS = { new: "contacted", contacted: "qualified", quoted: "won" }

// The row preview (Figma "V2 · Leads · Row preview panel"): a 460px panel over
// an 18% scrim with everything needed to triage one lead without leaving the
// list. The full page is "Open full lead".
export default function LeadPreview({ lead: l, now, products, quotations, actions, position, onMove, onClose }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const { items: invoices } = useCollection("invoices")
  const { items: customers } = useCollection("customers")
  const [fuMenu, setFuMenu] = useState(null)

  useEffect(() => {
    if (!l) return
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [l, onClose])

  const related = useMemo(() => (l ? quotations.filter((q) => q.enquiryId === l.id || sameCustomer(l.e.customer, q.customer)) : []), [l, quotations])
  const advice = useMemo(() => (l ? enquiryAdvisories(l.e, { rfq: l.rfq, products, related }) : []), [l, products, related])
  const lines = useMemo(() => (l?.items.length ? rfqToQuotationLines(l.items, products) : []), [l, products])
  const history = useMemo(() => (l ? historyWith(l.e.customer, { invoices, quotations, customers }) : null), [l, invoices, quotations, customers])

  if (!l) return null
  const e = l.e
  const c = e.customer || {}
  const ch = channelMeta(l.channel)
  const status = ENQUIRY_STATUS.find((s) => s.id === (e.status || "new"))
  const gst = gstRead(c, settings?.company?.stateCode)
  const next = NEXT_STATUS[e.status || "new"]
  const stamp = new Date(e.createdAt || now)
  const org = [c.designation, c.company, c.city].filter(Boolean).join(" · ")

  const copy = (text, what) => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Could not copy"))

  const logCall = () => actions.logActivity(e, "call", "Call logged from the list", { followUpAt: null }, "Call logged")
  const primary = () => {
    if (e.status === "qualified" || (e.status === "contacted" && l.items.length)) return actions.quote({ ...e, rfqItems: l.items })
    if (next) return actions.setStatus(e, next)
  }
  const primaryLabel =
    e.status === "qualified" || (e.status === "contacted" && l.items.length)
      ? "Create quotation"
      : next
        ? `Mark as ${ENQUIRY_STATUS.find((s) => s.id === next).label.toLowerCase()}`
        : null

  const fuSections = [
    {
      title: "Follow up",
      items: [
        { icon: Clock, label: "Tomorrow, 10 am", onSelect: () => actions.followUp(e, tomorrowAt10(now)) },
        { icon: Clock, label: "In 3 days", onSelect: () => actions.followUp(e, new Date(new Date(tomorrowAt10(now)).getTime() + 2 * DAY).toISOString()) },
        { icon: Clock, label: "Next week", onSelect: () => actions.followUp(e, new Date(new Date(tomorrowAt10(now)).getTime() + 6 * DAY).toISOString()) },
        ...(e.followUpAt ? [{ icon: Clock, label: "Clear", onSelect: () => actions.followUp(e, null) }] : []),
      ],
    },
  ]

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label={`Lead ${l.name || "preview"}`}>
      <div className="absolute inset-0 bg-foreground/[0.18] animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[460px] flex-col bg-card shadow-overlay-lg animate-drawer-in">
        {/* Header */}
        <div className="flex h-[58px] flex-none items-center gap-2 border-b border-border pl-5 pr-4">
          <span className="inline-flex h-5 flex-none items-center gap-1 rounded-md bg-primary/[0.08] px-2 text-[11px] font-medium text-primary">
            <ch.icon className="h-3 w-3" /> {l.flags.quote ? "Website RFQ" : ch.label}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {[e.reference, stamp.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/^(\d+ )(\w)/, (m, d, a) => d + a.toUpperCase())].filter(Boolean).join(" · ")}
          </span>
          <span className="ml-auto flex flex-none items-center gap-0.5 text-muted-foreground" title={position}>
            <button type="button" onClick={() => onMove(-1)} aria-label="Previous lead (K)" className="grid h-7 w-5 place-items-center hover:text-foreground">
              <span className="text-sm">↑</span>
            </button>
            <button type="button" onClick={() => onMove(1)} aria-label="Next lead (J)" className="grid h-7 w-5 place-items-center hover:text-foreground">
              <span className="text-sm">↓</span>
            </button>
          </span>
          <Link to={`/enquiries/${l.id}`} title="Open full lead" className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full border border-line text-muted-foreground hover:text-primary">
            <Maximize className="h-3.5 w-3.5" />
          </Link>
          <CloseButton onClick={onClose} className="rounded-full border border-line" />
        </div>

        {/* Body */}
        <div className="scroll-thin flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <Initials name={l.name} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-lg font-semibold text-foreground">{l.name || "Unnamed caller"}</span>
                <button type="button" title={e.starred ? "Remove star" : "Star"} onClick={() => actions.patch(e, { starred: !e.starred })} className={cn("text-base leading-none", e.starred ? "text-warning" : "text-line hover:text-warning")}>
                  ★
                </button>
              </div>
              <div className="truncate text-xs text-muted-foreground">{org || prettyPhone(c.phone) || "No company given"}</div>
            </div>
          </div>

          {/* Status · Owner · Follow-up */}
          <div className="grid grid-cols-3 gap-2">
            <Picker label="Status" onClick={(ev) => actions.pickStatus(e, ev.currentTarget)}>
              <Dot tone={STATUS_TONE[e.status || "new"]} size={7} /> {status?.label}
            </Picker>
            <Picker label="Owner" onClick={(ev) => actions.pickOwner(e, ev.currentTarget)}>
              {e.owner || <span className="text-primary">Assign</span>}
            </Picker>
            <Picker label="Follow-up" onClick={(ev) => setFuMenu(ev.currentTarget)}>
              {l.step ? (
                <>
                  <Dot tone={l.step.overdue ? "rose" : l.step.today ? "amber" : "slate"} size={7} />
                  <span className={cn(l.step.overdue && "text-destructive-text")}>{l.step.overdue ? "Overdue" : dueLabel(l.step.due, now)}</span>
                </>
              ) : (
                "None"
              )}
            </Picker>
          </div>

          {/* Big actions */}
          <div className="grid grid-cols-4 gap-2">
            <BigAction icon={PhoneOutgoing} label="Call" k="C" onClick={(ev) => callContact(ev, contactOf(e))} disabled={!telHref(c.phone)} />
            <BigAction icon={MessageCircle} label="WhatsApp" k="W" href={waHref(c.phone)} external tone="green" />
            <BigAction icon={Mail} label="Email" k="E" href={mailHref(c.email)} />
            {l.quote ? (
              <BigAction icon={Send} label="Resend" k="R" primary onClick={() => actions.openQuote(l.quote)} />
            ) : (
              <BigAction icon={FileText} label="Quote" k="Q" primary onClick={() => actions.quote({ ...e, rfqItems: l.items })} disabled={!l.open} />
            )}
          </div>

          {/* Next action, said once */}
          {l.step && (
            <div className={cn("squircle rounded-xl px-3.5 py-3.5", l.step.overdue ? "bg-destructive/[0.07]" : l.step.today ? "bg-warning/10" : "bg-muted")}>
              <div className={cn("flex items-center gap-2 text-[13px] font-semibold", l.step.overdue ? "text-destructive-text" : l.step.today ? "text-warning-text" : "text-foreground")}>
                <Clock className="h-4 w-4 flex-none" />
                {l.step.label} {l.step.overdue ? `is ${dueLabel(l.step.due, now).replace("Overdue ", "")} overdue` : `· ${dueLabel(l.step.due, now)}`}
              </div>
              {advice.length > 0 && <p className="mt-1.5 text-xs leading-[18px] text-muted-foreground">{advice.slice(0, 2).map((a) => a.text).join(" ")}</p>}
              <div className="mt-3 flex gap-2">
                <SmallButton icon={PhoneOutgoing} onClick={logCall}>Log call</SmallButton>
                <SmallButton icon={Clock} onClick={() => actions.followUp(e)}>Snooze</SmallButton>
              </div>
            </div>
          )}

          {/* Asked for */}
          <div>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-foreground">Asked for</span>
              {l.value > 0 && <span className="font-semibold text-foreground tabular">{rupees(l.value)} {l.quote ? "quoted" : "est."}</span>}
            </div>
            <div className="squircle divide-y divide-border overflow-hidden rounded-xl border border-line">
              {lines.length > 0 ? (
                lines.map((ln, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{ln.description}</span>
                    <span className="flex-none text-muted-foreground tabular">{Number(ln.quantity || 0).toLocaleString("en-IN")} {l.items[i]?.unit || "pcs"}</span>
                    <span className="w-[72px] flex-none text-right font-semibold text-foreground tabular">{ln.rate ? rupees(ln.rate * ln.quantity) : "—"}</span>
                  </div>
                ))
              ) : l.askedItems.length ? (
                l.askedItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{it.product}</span>
                    <span className="flex-none text-muted-foreground tabular">{it.quantity ? `Qty ${it.quantity}` : "Qty not given"}</span>
                  </div>
                ))
              ) : (
                <div className="px-3.5 py-2.5 text-[12.5px] text-muted-foreground">Nothing specific asked for yet.</div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {l.flags.artwork && (
                <Tag tone={l.flags.artwork === "attached" ? "emerald" : "rose"} className="h-5 gap-1">
                  <ImageIcon className="h-3 w-3" /> {l.flags.artwork === "attached" ? "Artwork attached" : "Artwork did not upload"}
                </Tag>
              )}
              {gst && (
                <Tag tone={gst.ok ? "emerald" : "amber"} className="h-5 gap-1">
                  <ShieldCheck className="h-3 w-3" /> {gst.text}
                </Tag>
              )}
              {(e.tags || []).map((t) => (
                <Tag key={t} tone="blue" className="h-5">{t}</Tag>
              ))}
            </div>
            {l.summary.trim() && <p className="mt-2 text-xs leading-[18px] text-muted-foreground">“{l.summary.trim()}”</p>}
            {l.timeline && <p className="mt-1 text-xs font-medium text-foreground">Timeline: {l.timeline}</p>}
          </div>

          {/* Contact */}
          <div className="squircle space-y-2.5 rounded-xl bg-muted px-3.5 py-3 text-[12.5px]">
            {c.phone && (
              <ContactLine icon={PhoneOutgoing} text={prettyPhone(c.phone)} action="Copy" onAction={() => copy(c.phone, "Phone")} />
            )}
            {c.email && <ContactLine icon={Mail} text={c.email} action="Copy" onAction={() => copy(c.email, "Email")} />}
            {history && (history.invoices.length > 0 || history.quotes.length > 1) && (
              <ContactLine
                icon={FileSpreadsheet}
                text={`${c.company || firstName(c.name) || "This customer"}: ${rupees(history.lifetime)} lifetime · ${history.invoices.length} invoice${history.invoices.length === 1 ? "" : "s"}`}
                action={history.master ? "Open" : null}
                onAction={() => navigate(`/customers/${history.master.id}`)}
              />
            )}
            {!c.phone && !c.email && <p className="text-muted-foreground">No phone or email on this lead.</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-none items-center gap-2 border-t border-border px-5 py-3">
          <Link to={`/enquiries/${l.id}`} className="squircle inline-flex h-[37px] items-center gap-2 rounded-[10px] border border-line px-4 text-[13px] font-medium text-foreground hover:bg-muted">
            <Maximize className="h-3.5 w-3.5 text-muted-foreground" /> Open full lead
          </Link>
          {primaryLabel && (
            <button type="button" onClick={primary} className="squircle ml-auto inline-flex h-[37px] items-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover">
              <CheckCircle2 className="h-4 w-4" /> {primaryLabel}
            </button>
          )}
        </div>
      </aside>
      <ActionMenu open={!!fuMenu} anchor={fuMenu} onClose={() => setFuMenu(null)} sections={fuSections} width={200} />
    </div>,
    document.body,
  )
}

function Picker({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="squircle flex min-w-0 items-center gap-1 rounded-[10px] border border-line px-2.5 py-1.5 text-left hover:border-primary/40">
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] leading-3 text-muted-foreground">{label}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-semibold leading-4 text-foreground">{children}</span>
      </span>
      <Chevron className="h-3.5 w-3.5 flex-none text-muted-foreground" />
    </button>
  )
}

function BigAction({ icon: Icon, label, k, href, external, onClick, primary, tone, disabled }) {
  const cls = cn(
    "squircle flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-xl border text-[13px] font-medium transition-colors",
    primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover" : "border-line bg-card text-foreground hover:border-primary/40",
    (disabled || (!href && !onClick)) && "pointer-events-none opacity-40",
  )
  const body = (
    <>
      <Icon className={cn("mb-0.5 h-[18px] w-[18px]", primary ? "" : tone === "green" ? "text-success-text" : "text-muted-foreground")} />
      {label}
      <span className={cn("text-[10px] font-normal", primary ? "text-primary-foreground/70" : "text-muted-foreground")}>{k}</span>
    </>
  )
  if (href) {
    return (
      <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  )
}

function SmallButton({ icon: Icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="squircle inline-flex h-[34px] items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {children}
    </button>
  )
}

function ContactLine({ icon: Icon, text, action, onAction }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">{text}</span>
      {action && (
        <button type="button" onClick={onAction} className="flex-none font-medium text-primary hover:underline">
          {action}
        </button>
      )}
    </div>
  )
}
