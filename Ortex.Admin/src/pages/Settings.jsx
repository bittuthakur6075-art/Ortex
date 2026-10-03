import { useState, useEffect, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Inbox,
  Lock,
  CalendarClock,
  IndianRupee,
  Mail,
  PhoneOutgoing,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { hasSupabase } from "../data/store/supabaseClient"
import { useSettings, useCollections, useCollection } from "../hooks/useCollection"
import { loadDemoData, countDemoData, removeDemoData } from "../data/seed/seed"
import { syncIndiaMart } from "../services/integrations"
import { GST_RATES } from "../data/domain/schema"
import { GST_STATES, stateLabel } from "../lib/gstStates"
import AttendanceSettings from "./attendance/Settings"
import PayrollSettings from "./payroll/PayrollSettings"
import Modules from "./Modules"
import { Button, Input, Select, Switch, Textarea, PageLoader } from "../components/ui/Ui"
import { cn } from "../lib/cn"

// Settings (Figma "V3 · Settings"): a section menu on the left, one section at
// a time, every setting as a row (label and why on the left, control on the
// right), a live preview of how the company prints on a quotation, and a
// floating bar whenever something is unsaved. The page is the Super Admin's
// (the settings table is written only by them, migration 0050); attendance,
// payroll, the team bot and role permissions keep their own pages, linked
// under "Elsewhere".

// The Control centre: EVERYTHING the Super Admin configures, in one place.
// Before this it was four: /settings, /modules, and two tabs buried inside the
// Attendance hub, with a list of links at the bottom of this page apologising
// for the other three.
//
// The group is what the setting is ABOUT, so a person hunting one reads five
// headings rather than twenty items. "Security" is gone: it held one card for
// changing your own password, which belongs in Profile and was invisible here
// to everyone who is not the Super Admin.
const SECTIONS = [
  { id: "company", group: "Business", label: "Company", icon: Building2 },
  { id: "documents", group: "Business", label: "Documents", icon: FileText },
  { id: "attendance", group: "People", label: "Attendance & leave", icon: CalendarClock },
  { id: "payroll", group: "People", label: "Payroll", icon: IndianRupee },
  { id: "access", group: "Access", label: "Modules & roles", icon: Lock },
  { id: "notifications", group: "Connections", label: "Notifications", icon: Mail },
  { id: "integrations", group: "Connections", label: "Integrations", icon: Globe },
  { id: "data", group: "Data", label: "Data", icon: Database },
]

const GROUPS = [...new Set(SECTIONS.map((s) => s.group))]

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

// Every leaf that differs between two settings objects, as "a.b.c" paths.
function changedPaths(a, b, prefix = "") {
  if (a === b) return []
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return [prefix || "settings"]
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((k) => changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k))
}

const PATH_LABEL = {
  "company.name": "Company name",
  "company.tagline": "Tagline",
  "company.gstin": "GSTIN",
  "company.stateCode": "State",
  "company.email": "Email",
  "company.phone": "Phone",
  "company.address": "Address",
  "company.bankName": "Bank name",
  "company.bankAccount": "Account number",
  "company.bankIfsc": "IFSC",
  "company.bankBranch": "Branch",
  "company.upi": "UPI ID",
  "company.paymentAliases": "Other names and accounts",
  "tax.defaultGstRate": "Default GST",
  "numbering.quotationPrefix": "Quotation prefix",
  "numbering.invoicePrefix": "Invoice prefix",
  "numbering.paymentPrefix": "Payment prefix",
  "quotation.validityDays": "Validity",
  "quotation.terms": "Terms",
  "notifications.invoiceEmailEnabled": "Invoice email",
  "notifications.recipient": "Recipient",
  "notifications.sender": "Sender",
  "integrations.indiamart.enabled": "IndiaMART sync",
  "integrations.indiamart.crmKey": "IndiaMART key",
}

// The financial year as the document numbers write it: Sep 2026 → "2627".
function fyCode(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${String(y).slice(2)}${String(y + 1).slice(2)}`
}

export default function Settings() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const section = SECTIONS.some((s) => s.id === params.get("section")) ? params.get("section") : "company"

  useEffect(() => {
    if (settings) setDraft(structuredClone(settings))
  }, [settings])

  const changes = useMemo(() => (settings && draft ? changedPaths(settings, draft) : []), [settings, draft])

  if (!settings || !draft) return <PageLoader />

  const set = (group, key, v) => setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }))
  const setEmailjs = (key, v) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, emailjs: { ...d.notifications.emailjs, [key]: v } } }))
  const setIndiamart = (key, v) => setDraft((d) => ({ ...d, integrations: { ...d.integrations, indiamart: { ...d.integrations.indiamart, [key]: v } } }))

  const save = async () => {
    setSaving(true)
    try {
      await repo.saveSettings(draft)
      toast.success("Settings saved")
    } catch (e) {
      toast.error(e.message || "Could not save the settings")
    } finally {
      setSaving(false)
    }
  }
  const go = (id) => setParams(id === "company" ? {} : { section: id }, { replace: true })
  // A list changes by index (company.paymentAliases.2): name the list.
  const changedWords = changes.map((p) => PATH_LABEL[p] || PATH_LABEL[p.replace(/\.\d+$/, "")] || p.split(".").pop()).filter((v, i, a) => a.indexOf(v) === i)

  const indiamartOn = !!draft.integrations.indiamart.enabled && !!draft.integrations.indiamart.crmKey
  const emailOn = !!draft.notifications.invoiceEmailEnabled

  return (
    <div className="pb-24">
      <header className="mb-6">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-foreground">Control centre</h1>
        <p className="mt-1.5 text-[13.5px] text-subtle-foreground">Everything you configure, in one place. Only you can change these, and a change applies from the moment you save.</p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ---- section menu ---- */}
        <nav className="flex flex-none gap-1 overflow-x-auto lg:sticky lg:top-20 lg:w-[212px] lg:flex-col lg:gap-0.5 lg:overflow-visible" aria-label="Control centre sections">
          {GROUPS.flatMap((group) => [
            // The heading is desktop only: the mobile nav is one scrolling row,
            // where a heading between items reads as another item.
            <div
              key={`g-${group}`}
              className="hidden px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground first:pt-0 lg:block"
            >
              {group}
            </div>,
            ...SECTIONS.filter((s) => s.group === group).map((s) => {
            const active = s.id === section
            const pill = s.id === "notifications" ? (emailOn ? null : ["Off", "slate"]) : s.id === "integrations" ? (indiamartOn ? null : ["1 off", "amber"]) : null
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "squircle flex h-10 flex-none items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] transition-colors",
                  active ? "bg-card font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-card/70",
                )}
              >
                <s.icon className={cn("h-[18px] w-[18px] flex-none", active ? "text-primary" : "text-subtle-foreground")} />
                <span className="flex-1 whitespace-nowrap text-left">{s.label}</span>
                {pill && <Pill tone={pill[1]}>{pill[0]}</Pill>}
              </button>
            )
            }),
          ])}
        </nav>

        {/* ---- the section ---- */}
        <div className="min-w-0 flex-1">
          {section === "company" && <CompanySection draft={draft} set={set} />}
          {section === "documents" && <DocumentsSection draft={draft} set={set} />}
          {section === "notifications" && <NotificationsSection draft={draft} set={set} setEmailjs={setEmailjs} />}
          {section === "integrations" && <IntegrationsSection draft={draft} settings={settings} setIndiamart={setIndiamart} />}
          {/* These three were whole pages of their own. They keep their own
              cards and their own save buttons; only their address changed. */}
          {section === "attendance" && (
            <SectionHead title="Attendance & leave" description="The rules every clock-in, day status and leave request is judged by.">
              <AttendanceSettings />
            </SectionHead>
          )}
          {section === "payroll" && (
            <SectionHead title="Payroll" description="Pay heads, cycles and statutory settings for the pay run.">
              <PayrollSettings />
            </SectionHead>
          )}
          {section === "access" && (
            <SectionHead title="Modules & roles" description="Who can open what: each module for the company, for a role, and for one person.">
              <Modules embedded />
            </SectionHead>
          )}
          {section === "data" && <DataSection />}
        </div>
      </div>

      {/* ---- unsaved changes ---- */}
      {changes.length > 0 && (
        <div className="squircle fixed bottom-5 left-1/2 z-30 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-foreground py-2.5 pl-[18px] pr-2.5 text-primary-foreground animate-pop-in lg:left-[calc(50%+116px)]">
          <span className="h-2 w-2 flex-none rounded-full bg-warning" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {changes.length === 1 ? "1 unsaved change" : `${changes.length} unsaved changes`}
            <span className="opacity-60"> · {changedWords.slice(0, 3).join(", ")}{changedWords.length > 3 ? "…" : ""}</span>
          </span>
          <button type="button" onClick={() => setDraft(structuredClone(settings))} className="h-9 rounded-xl px-3.5 text-[13.5px] font-medium opacity-80 hover:opacity-100">
            Discard
          </button>
          <button type="button" onClick={save} disabled={saving} className="squircle h-9 rounded-xl bg-card px-4 text-[13.5px] font-semibold text-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  )
}

// ---- building blocks ------------------------------------------------------------------

function Pill({ tone = "slate", children }) {
  const t = {
    slate: "bg-secondary text-muted-foreground",
    amber: "bg-warning/12 text-warning-text",
    green: "bg-success/12 text-success-text",
    blue: "bg-primary/10 text-primary",
    red: "bg-destructive/10 text-destructive-text",
  }[tone]
  return <span className={cn("squircle inline-flex items-center whitespace-nowrap rounded-[10px] px-[9px] py-[3px] text-[11.5px] font-medium leading-[14px]", t)}>{children}</span>
}

function SectionHead({ title, description, children }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-subtle-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Group({ title, description, children, className }) {
  return (
    <div className={cn("squircle rounded-card bg-card", className)}>
      <div className="px-6 pb-1 pt-5">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] text-subtle-foreground">{description}</p>}
      </div>
      <div className="divide-y divide-border px-6 pb-3">{children}</div>
    </div>
  )
}

// A setting: label and why on the left, the control on the right; stacked on a phone.
function Row({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-5">
      <div className="sm:w-[170px] sm:flex-none">
        <div className="text-[13.5px] font-medium text-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-subtle-foreground">{hint}</div>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ---- Company ---------------------------------------------------------------------------

function CompanySection({ draft, set }) {
  const c = draft.company
  const [showAcct, setShowAcct] = useState(false)
  const gstin = String(c.gstin || "").trim().toUpperCase()
  const gstOk = GSTIN_RE.test(gstin)
  const gstState = gstOk ? gstin.slice(0, 2) : null
  const stateMismatch = gstOk && c.stateCode && String(c.stateCode).padStart(2, "0") !== gstState
  const acct = String(c.bankAccount || "")

  return (
    <SectionHead title="Company" description="How your business appears on quotations and invoices.">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Group title="Business details" description="Printed at the top of every document.">
            <Row label="Company name">
              <Input value={c.name} onChange={(e) => set("company", "name", e.target.value)} />
            </Row>
            <Row label="Tagline" hint="Optional, under the name">
              <Input value={c.tagline} onChange={(e) => set("company", "tagline", e.target.value)} />
            </Row>
            <Row label="GSTIN" hint="15 characters">
              <Input value={c.gstin} onChange={(e) => set("company", "gstin", e.target.value.toUpperCase())} />
              {gstin && (
                <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs font-medium", gstOk && !stateMismatch ? "text-success-text" : "text-warning-text")}>
                  {gstOk && !stateMismatch ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {!gstOk ? "This does not look like a GSTIN" : stateMismatch ? `The GSTIN is from ${stateLabel(gstState)}, but the state below says otherwise` : `Valid · ${stateLabel(gstState)}`}
                </p>
              )}
            </Row>
            <Row label="State" hint="Place of business: sets local or interstate GST">
              <Select value={String(c.stateCode || "").padStart(2, "0")} onChange={(e) => set("company", "stateCode", e.target.value)}>
                <option value="00">Choose a state</option>
                {Object.entries(GST_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} · {name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Email">
              <Input type="email" value={c.email} onChange={(e) => set("company", "email", e.target.value)} />
            </Row>
            <Row label="Phone">
              <Input value={c.phone} onChange={(e) => set("company", "phone", e.target.value)} />
            </Row>
            <Row label="Address">
              <Textarea value={c.address} onChange={(e) => set("company", "address", e.target.value)} className="min-h-[76px]" />
            </Row>
          </Group>

          <Group title="Bank details" description="Shown on quotations and invoices so customers can pay.">
            <Row label="Bank name">
              <Input value={c.bankName} onChange={(e) => set("company", "bankName", e.target.value)} />
            </Row>
            <Row label="Account number">
              <div className="relative">
                <Input
                  value={showAcct || !acct ? acct : `•••• •••• ${acct.slice(-4)}`}
                  readOnly={!showAcct && !!acct}
                  onFocus={() => setShowAcct(true)}
                  onChange={(e) => set("company", "bankAccount", e.target.value)}
                  className="pr-16"
                />
                {acct && (
                  <button
                    type="button"
                    onClick={() => setShowAcct((s) => !s)}
                    className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-primary hover:bg-primary/10"
                  >
                    {showAcct ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showAcct ? "Hide" : "Show"}
                  </button>
                )}
              </div>
            </Row>
            <Row label="IFSC and branch">
              <div className="grid grid-cols-2 gap-2.5">
                <Input value={c.bankIfsc} onChange={(e) => set("company", "bankIfsc", e.target.value.toUpperCase())} placeholder="IFSC" />
                <Input value={c.bankBranch} onChange={(e) => set("company", "bankBranch", e.target.value)} placeholder="Branch" />
              </div>
            </Row>
            <Row label="UPI ID" hint="Optional">
              <Input value={c.upi} onChange={(e) => set("company", "upi", e.target.value)} placeholder="name@bank" />
            </Row>
            <Row
              label="Other names and accounts"
              hint="One per line: a name, a UPI ID or an account number the business also pays or is paid through, such as an owner's personal account. The payment screenshot reader counts these as the company to tell money received from a payout. Every staff member can see this list."
            >
              <Textarea
                rows={3}
                value={(c.paymentAliases || []).join("\n")}
                onChange={(e) => set("company", "paymentAliases", e.target.value.split("\n"))}
                placeholder={"Owner name\nowner@okicici\nXXXX 1912"}
              />
            </Row>
          </Group>
        </div>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-20 xl:w-[312px] xl:flex-none">
          <DocumentPreview company={c} prefix={draft.numbering.quotationPrefix} />
          <p className="squircle flex items-start gap-2.5 rounded-xl bg-primary/10 px-3.5 py-3 text-[12.5px] font-medium text-primary">
            <ShieldCheck className="mt-0.5 h-[18px] w-[18px] flex-none" />
            Only the Super Admin can change these. Admins can read them.
          </p>
        </aside>
      </div>
    </SectionHead>
  )
}

function DocumentPreview({ company: c, prefix }) {
  const acct = String(c.bankAccount || "")
  const lines = [c.address, [c.gstin && `GSTIN ${c.gstin}`, c.phone].filter(Boolean).join(" · ")].filter(Boolean)
  return (
    <div className="squircle flex flex-col gap-3.5 rounded-card bg-card p-5">
      <div className="flex items-center gap-2">
        <Printer className="h-[18px] w-[18px] text-primary" />
        <span className="flex-1 text-sm font-semibold text-foreground">On a quotation</span>
        <Pill tone="green">Live</Pill>
      </div>
      <div className="squircle flex flex-col gap-2.5 rounded-xl border border-border p-4">
        <div className="flex gap-2.5">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-primary text-sm font-bold text-primary-foreground">
            {(c.name || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-foreground">{c.name || "Company name"}</div>
            {c.tagline && <div className="text-[10px] leading-snug text-subtle-foreground">{c.tagline}</div>}
          </div>
          <div className="flex-none text-right">
            <div className="text-[10px] font-bold tracking-[0.06em] text-primary">QUOTATION</div>
            <div className="text-[10px] font-medium text-muted-foreground">
              {prefix || "QTN"}-{fyCode()}-0001
            </div>
          </div>
        </div>
        {lines.length > 0 && <div className="whitespace-pre-line text-[10px] leading-relaxed text-muted-foreground">{lines.join("\n")}</div>}
        <div className="h-px bg-border" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-1.5">
            <span className="h-1.5 flex-1 rounded-full bg-secondary" />
            <span className="h-1.5 w-10 rounded-full bg-secondary" />
          </div>
        ))}
        {(c.bankName || acct || c.upi) && (
          <div className="rounded-lg bg-subtle p-2.5">
            <div className="text-[9px] font-bold tracking-[0.06em] text-subtle-foreground">PAY TO</div>
            <div className="mt-0.5 text-[10px] font-medium text-foreground">
              {[c.bankName, acct && `A/c ••${acct.slice(-4)}`, c.bankIfsc].filter(Boolean).join(" · ")}
            </div>
            {c.upi && <div className="text-[10px] text-muted-foreground">UPI {c.upi}</div>}
          </div>
        )}
      </div>
      <p className="text-xs text-subtle-foreground">Updates as you type. Documents already sent keep the details they were created with.</p>
    </div>
  )
}

// ---- Documents -------------------------------------------------------------------------

function DocumentsSection({ draft, set }) {
  const n = draft.numbering
  const fy = fyCode()
  return (
    <SectionHead title="Documents" description="Defaults for every new quotation and invoice.">
      <Group title="Tax">
        <Row label="Default GST" hint="For new lines; each line can change it">
          <Select value={draft.tax.defaultGstRate} onChange={(e) => set("tax", "defaultGstRate", Number(e.target.value))}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </Select>
        </Row>
      </Group>
      <Group title="Numbering" description={`Numbers restart every financial year: PREFIX-${fy}-0001.`}>
        {[
          ["Quotation", "quotationPrefix"],
          ["Invoice", "invoicePrefix"],
          ["Payment", "paymentPrefix"],
        ].map(([label, key]) => (
          <Row key={key} label={`${label} prefix`}>
            <div className="flex items-center gap-3">
              <Input value={n[key]} onChange={(e) => set("numbering", key, e.target.value.toUpperCase())} className="max-w-[160px]" />
              <span className="text-[13px] text-subtle-foreground">
                Next looks like <span className="font-medium text-foreground tabular">{(n[key] || "?") + `-${fy}-0001`}</span>
              </span>
            </div>
          </Row>
        ))}
      </Group>
      <Group title="Quotation terms" description="Pre-filled on every new quotation; each one can be edited.">
        <Row label="Valid for" hint="Days from the issue date">
          <Input type="number" min="1" value={draft.quotation.validityDays} onChange={(e) => set("quotation", "validityDays", Number(e.target.value))} className="max-w-[160px]" />
        </Row>
        <Row label="Terms and conditions" hint="One term per line">
          <Textarea
            ai={{
              purpose:
                "Default terms and conditions pre-filled on every new sales quotation from Ortex Industries: validity, payment, artwork approval, production time and delivery, one term per line",
              context: () => ({ validityDays: draft.quotation.validityDays }),
              format: "lines",
              maxChars: 900,
            }}
            value={draft.quotation.terms}
            onChange={(e) => set("quotation", "terms", e.target.value)}
            className="min-h-[140px]"
          />
        </Row>
      </Group>
    </SectionHead>
  )
}

// ---- Notifications -------------------------------------------------------------------

function NotificationsSection({ draft, set, setEmailjs }) {
  const nf = draft.notifications
  const silent = !!(nf.emailjs.serviceId && nf.emailjs.templateId && nf.emailjs.publicKey)
  return (
    <SectionHead title="Notifications" description="Emails the console sends for you.">
      <Group title="Invoice email" description="A copy of every new invoice, sent to your accounts inbox.">
        <Row label="Send a copy" hint={nf.invoiceEmailEnabled ? (silent ? "Sends silently through EmailJS" : "Opens your mail app, ready to send") : "Off"}>
          <Switch checked={!!nf.invoiceEmailEnabled} onChange={(v) => set("notifications", "invoiceEmailEnabled", v)} label="Email a copy when an invoice is generated" />
        </Row>
        <Row label="Send to" hint="Where the copy goes">
          <Input type="email" value={nf.recipient} onChange={(e) => set("notifications", "recipient", e.target.value)} placeholder="accounts@yourcompany.in" />
        </Row>
        <Row label="Sent from" hint="Reply address, used with EmailJS">
          <Input type="email" value={nf.sender} onChange={(e) => set("notifications", "sender", e.target.value)} placeholder="sales@yourcompany.in" />
        </Row>
      </Group>
      <Group title="Send silently (optional)" description="With EmailJS keys the copy goes out without opening your mail app.">
        <Row label="Service ID">
          <Input value={nf.emailjs.serviceId} onChange={(e) => setEmailjs("serviceId", e.target.value)} />
        </Row>
        <Row label="Template ID">
          <Input value={nf.emailjs.templateId} onChange={(e) => setEmailjs("templateId", e.target.value)} />
        </Row>
        <Row label="Public key">
          <Input value={nf.emailjs.publicKey} onChange={(e) => setEmailjs("publicKey", e.target.value)} />
        </Row>
      </Group>
    </SectionHead>
  )
}

// ---- Integrations -------------------------------------------------------------------

function IntegrationCard({ icon: Icon, tone, title, description, status, facts, children }) {
  const well = { blue: "bg-primary/10 text-primary", violet: "bg-info/10 text-info-text", rose: "bg-destructive/10 text-destructive-text", slate: "bg-secondary text-muted-foreground" }[tone]
  return (
    <div className="squircle flex flex-col gap-4 rounded-card bg-card p-5">
      <div className="flex items-center gap-3">
        <span className={cn("squircle grid h-10 w-10 flex-none place-items-center rounded-xl", well)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">{title}</span>
        <Pill tone={status[1]}>{status[0]}</Pill>
      </div>
      <p className="text-[13px] text-muted-foreground">{description}</p>
      {facts && (
        <div className="grid grid-cols-2 gap-2">
          {facts.map(([k, v]) => (
            <div key={k} className="squircle rounded-xl bg-subtle px-3 py-2.5">
              <div className="text-[11.5px] font-medium text-subtle-foreground">{k}</div>
              <div className="mt-1 truncate text-[13px] font-semibold text-foreground" title={String(v)}>
                {v}
              </div>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

function IntegrationsSection({ draft, settings, setIndiamart }) {
  const im = draft.integrations.indiamart
  const [syncing, setSyncing] = useState(false)
  const [editingKey, setEditingKey] = useState(!im.crmKey)
  const { items: usage } = useCollection("ai_usage")
  const provider = settings.telecaller?.provider || "simulate"

  const ai = useMemo(() => {
    const rows = usage || []
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    const today = new Date().toDateString()
    return {
      tokens: rows.reduce((a, r) => a + (Number(r.totalTokens) || 0), 0),
      month: rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= monthStart).length,
      today: rows.filter((r) => r.createdAt && new Date(r.createdAt).toDateString() === today).length,
      model: rows.find((r) => r.model)?.model || "gemini-flash-lite-latest",
    }
  }, [usage])

  const syncNow = async () => {
    setSyncing(true)
    try {
      await repo.saveSettings(draft) // the server pulls with the saved key
      const res = await syncIndiaMart()
      if (res.error) toast.error(res.error)
      else if (res.skipped) toast.message(res.reason || "IndiaMART sync is off")
      else toast.success(`IndiaMART: ${res.inserted} new lead(s) imported${res.duplicates ? `, ${res.duplicates} already had` : ""}`)
    } finally {
      setSyncing(false)
    }
  }

  const imOn = !!im.enabled && !!im.crmKey
  const nf = (n) => (Number(n) || 0).toLocaleString("en-IN")

  return (
    <SectionHead title="Integrations" description="What the console is connected to, and whether each connection is working.">
      <div className="grid gap-5 lg:grid-cols-2">
        <IntegrationCard
          icon={Inbox}
          tone="blue"
          title="IndiaMART leads"
          description="Imports buyer enquiries into Enquiries."
          status={imOn ? ["On", "green"] : im.crmKey ? ["Off", "slate"] : ["No key", "amber"]}
          facts={[
            ["Last sync", im.lastPull ? new Date(im.lastPull).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"],
            ["Result", im.lastResult || "No sync yet"],
          ]}
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <span className="text-[13px] font-medium text-foreground">Sync new leads</span>
            <Switch checked={!!im.enabled} onChange={(v) => setIndiamart("enabled", v)} label="Enable IndiaMART lead sync" />
          </div>
          {editingKey ? (
            <Input
              type="password"
              value={im.crmKey}
              onChange={(e) => setIndiamart("crmKey", e.target.value)}
              placeholder="CRM / Pull API key (Lead Manager → CRM Integration)"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || !im.crmKey}>
              <RefreshCw className="h-4 w-4" /> {syncing ? "Syncing…" : "Save and sync now"}
            </Button>
            {!editingKey && (
              <Button size="sm" variant="outline" onClick={() => setEditingKey(true)}>
                Change key
              </Button>
            )}
          </div>
        </IntegrationCard>

        <IntegrationCard
          icon={Sparkles}
          tone="violet"
          title="AI assistant"
          description="Gemini writes copy and powers Anu. Product photo edits run on Cloudflare."
          status={["Working", "green"]}
          facts={[
            ["Calls this month", nf(ai.month)],
            ["Today", `${nf(ai.today)} of 1,000 free`],
            ["Model", ai.model],
            ["Tokens, all time", nf(ai.tokens)],
          ]}
        >
          <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-primary hover:underline">
            Usage in Google AI Studio →
          </a>
        </IntegrationCard>

        <IntegrationCard
          icon={PhoneOutgoing}
          tone="violet"
          title="Call agent"
          description="Places follow-up calls for IndiaMART and starred enquiries."
          status={provider === "simulate" ? ["Simulate", "amber"] : ["Live", "green"]}
          facts={[
            ["Provider", provider === "simulate" ? "Simulate, no real calls" : "Vapi"],
            ["Daily cap", `${settings.telecaller?.dailyCap ?? 40} calls`],
          ]}
        >
          <Link to="/telecaller?tab=agent" className="text-[13px] font-semibold text-primary hover:underline">
            Open the agent's settings →
          </Link>
        </IntegrationCard>

      </div>
    </SectionHead>
  )
}

// ---- Data ------------------------------------------------------------------------------

function DataSection() {
  const { data } = useCollections(["products", "enquiries", "quotations", "invoices", "payments"])

  // Count first, then confirm with the real numbers, so nobody deletes blind.
  const purgeDemoData = async () => {
    const counts = await countDemoData()
    const total = Object.values(counts).reduce((n, c) => n + c, 0)
    if (!total) return toast.info("No demo records found.")
    const lines = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([name, c]) => `${c} ${name}`)
      .join(", ")
    if (!window.confirm(`Delete the demo dataset? This removes ${lines}. Records from the website, IndiaMART or entered by hand are not touched. This cannot be undone.`)) return
    const removed = await removeDemoData()
    toast.success(`Demo data removed (${Object.values(removed).reduce((n, c) => n + c, 0)} records)`)
  }

  return (
    <SectionHead title="Data" description={hasSupabase ? "What the live database holds." : "This browser's local demo data."}>
      <div className="squircle grid grid-cols-2 gap-2 rounded-card bg-card p-5 sm:grid-cols-5">
        {[
          ["Products", data.products?.length || 0],
          ["Enquiries", data.enquiries?.length || 0],
          ["Quotations", data.quotations?.length || 0],
          ["Invoices", data.invoices?.length || 0],
          ["Payments", data.payments?.length || 0],
        ].map(([label, count]) => (
          <div key={label} className="squircle rounded-xl bg-subtle px-3.5 py-3">
            <div className="text-xl font-semibold text-foreground tabular">{count.toLocaleString("en-IN")}</div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <Group title="Demo data" description="The eight sample customers and the enquiries, quotations, invoices and payments attached to them.">
        <Row label="Remove it" hint="Website, IndiaMART and hand-entered records are untouched, as are products">
          <Button variant="outline" size="sm" onClick={purgeDemoData}>
            <Trash2 className="h-4 w-4" /> Remove demo data
          </Button>
        </Row>
        {/* Local demo only: on the live database it would add fake invoices
            (duplicate GST numbers) and products the public site shows. seedDemo()
            refuses there too. */}
        {!hasSupabase && (
          <Row label="Load it" hint="Local demo only">
            <Button variant="outline" size="sm" onClick={loadDemoData}>
              <Sparkles className="h-4 w-4" /> Load demo data
            </Button>
          </Row>
        )}
      </Group>

      {/* Local demo only: on the live database this would wipe every business
          table. apiStore.clearAll() refuses as well. */}
      {!hasSupabase && (
        <div className="squircle rounded-card border border-destructive/30 bg-card p-5">
          <h3 className="text-[15px] font-semibold text-destructive-text">Delete everything in this browser</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">Products, enquiries, quotations, invoices, payments and settings. Local demo only.</p>
          <Button
            variant="danger"
            size="sm"
            className="mt-4"
            onClick={async () => {
              if (window.confirm("Delete ALL data - products, enquiries, quotations, invoices, payments and settings? This cannot be undone.")) {
                await repo.clearAll()
                toast.success("All data cleared")
              }
            }}
          >
            Clear all data
          </Button>
        </div>
      )}
    </SectionHead>
  )
}
