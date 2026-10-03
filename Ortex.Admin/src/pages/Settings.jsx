import { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
import { Banner, Button, Input, Select, Switch, Textarea, PageLoader } from "../components/ui/Ui"
import { UnsavedContext } from "../hooks/useUnsaved"
import { cn } from "../lib/cn"
import { useCompany, reloadCompanies } from "../hooks/useCompany"
import { settingsFor } from "../data/domain/settingsDefaults"
import CompanyMark from "../components/documents/CompanyMark"
import { companySlug } from "../lib/roles"
import { uploadCompanyLogo, removeCompanyLogo, LOGO_TYPES } from "../services/companyLogos"

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
  { id: "companies", group: "Business", label: "Companies", icon: Building2 },
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

// `paths` (from changedPaths) copied from `from` onto a copy of `to`. A list is
// copied whole, since it changes by index.
function mergePaths(to, from, paths) {
  const next = structuredClone(to)
  for (const p of paths) {
    const keys = p.split(".")
    let dst = next
    let src = from
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = src?.[k]
      if (i === keys.length - 1 || Array.isArray(v) || !v || typeof v !== "object") {
        dst[k] = structuredClone(v)
        break
      }
      if (!dst[k] || typeof dst[k] !== "object") dst[k] = {}
      dst = dst[k]
      src = v
    }
  }
  return next
}

// The sections the page's own draft (and its floating Save bar) covers; the
// others are embedded pages with their own Save buttons.
const DRAFT_SECTIONS = ["company", "documents", "notifications", "integrations"]

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
  "documents.invoiceTerms": "Invoice terms",
  "documents.quotationFooter": "Quotation closing line",
  "documents.invoiceFooter": "Invoice closing line",
  "documents.receiptFooter": "Receipt closing line",
  "notifications.invoiceEmailEnabled": "Invoice email",
  "notifications.recipient": "Recipient",
  "notifications.sender": "Sender",
  "integrations.indiamart.enabled": "IndiaMART sync",
  "integrations.indiamart.crmKey": "IndiaMART key",
  "company.logoText": "Short name",
  "tax.pricesIncludeTax": "Prices include tax",
  tallyCompany: "Tally company name",
}

// One company's editable settings (0075): its companies.doc blocks over the
// global settings (settingsFor), plus the Tally company name.
const companyShape = (settings, row) => ({ ...settingsFor(settings, row?.doc), tallyCompany: row?.doc?.tallyCompany || "" })

// The webhook IndiaMART pushes a company's leads to (the key is a function secret).
const indiamartHook = (companyId) =>
  `${import.meta.env.VITE_SUPABASE_URL || "https://<project>.supabase.co"}/functions/v1/indiamart-lead?company=${companyId}&key=<INDIAMART_PUSH_KEY>`

// { a: { b: v } } from "a.b", for mergePaths.
function pathObject(path, v) {
  return path.split(".").reduceRight((acc, k) => ({ [k]: acc }), v)
}

// The financial year as the document numbers write it: Sep 2026 → "2627".
function fyCode(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${String(y).slice(2)}${String(y + 1).slice(2)}`
}

export default function Settings() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  // The draft and the settings it was copied from. A live change (another tab,
  // the IndiaMART sync stamping lastPull) re-bases the draft only while it has
  // no unsaved changes, so nothing typed is ever overwritten.
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  // Unsaved changes inside the embedded sections (attendance rules, payroll
  // cards, modules), reported through UnsavedContext.
  const [unsaved, setUnsaved] = useState({})
  const report = useCallback((id, dirty) => setUnsaved((u) => (!!u[id] === dirty ? u : { ...u, [id]: dirty })), [])
  const section = SECTIONS.some((s) => s.id === params.get("section")) ? params.get("section") : "company"

  // Companies (0075): with a companies table, the Company and Documents sections
  // edit ONE company's companies.doc (picked at the top of each); the rest of
  // the page stays global. Before 0075 they edit the global settings, as always.
  const { all: companies } = useCompany()
  const companiesOn = companies.length > 0
  const [companyId, setCompanyId] = useState("")
  const chosen = companies.find((c) => c.id === companyId) || companies[0] || null
  const [cedit, setCedit] = useState(null)
  useEffect(() => {
    if (!settings || !chosen) return
    const fresh = companyShape(settings, chosen)
    setCedit((e) => (e && e.id === chosen.id && changedPaths(e.base, e.draft).length ? e : { id: chosen.id, base: fresh, draft: structuredClone(fresh) }))
  }, [settings, chosen])
  const cchanges = useMemo(() => (companiesOn && cedit ? changedPaths(cedit.base, cedit.draft) : []), [companiesOn, cedit])

  useEffect(() => {
    if (settings) setEdit((e) => (e && changedPaths(e.base, e.draft).length ? e : { base: settings, draft: structuredClone(settings) }))
  }, [settings])

  const draft = edit?.draft
  const changes = useMemo(() => (edit ? changedPaths(edit.base, edit.draft) : []), [edit])
  const embeddedDirty = Object.values(unsaved).some(Boolean)
  const allChanges = [...changes, ...cchanges]
  const dirty = allChanges.length > 0 || embeddedDirty

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  if (!settings || !draft) return <PageLoader />

  // Read failed: the page shows DEFAULT_SETTINGS, and saving would write those
  // placeholders over the real company details.
  const loadFailed = !!settings.loadFailed
  const setDraft = (fn) => setEdit((e) => ({ ...e, draft: fn(e.draft) }))
  const set = (group, key, v) => setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }))
  const setEmailjs = (key, v) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, emailjs: { ...d.notifications.emailjs, [key]: v } } }))
  // A key anywhere in the draft, by path ("integrations.indiamartByCompany.aman.crmKey").
  const setPath = (path, v) => setDraft((d) => mergePaths(d, { ...pathObject(path, v) }, [path]))
  const setC = (group, key, v) => setCedit((e) => ({ ...e, draft: group ? { ...e.draft, [group]: { ...e.draft[group], [key]: v } } : { ...e.draft, [key]: v } }))
  const pickCompanyToEdit = (id) => {
    if (id === chosen?.id) return
    if (cchanges.length && !window.confirm(`Discard the unsaved changes to ${chosen?.name}?`)) return
    setCedit(null)
    setCompanyId(id)
  }

  // One company's changed paths, merged into its LIVE doc, so a logo uploaded
  // meanwhile (or another block) is not overwritten with this page's copy.
  const saveCompanyPaths = async (paths) => {
    const row = companies.find((c) => c.id === cedit.id)
    if (!row) throw new Error("That company no longer exists.")
    const merged = mergePaths(companyShape(settings, row), cedit.draft, paths)
    const doc = { ...row.doc }
    for (const block of new Set(paths.map((p) => p.split(".")[0]))) doc[block] = merged[block]
    if (doc.company?.paymentAliases) doc.company = { ...doc.company, paymentAliases: doc.company.paymentAliases.map((a) => a.trim()).filter(Boolean) }
    await repo.saveCompany({ ...row, name: String(doc.company?.name || "").trim() || row.name, doc })
    await reloadCompanies()
    setCedit((e) => ({ id: e.id, base: mergePaths(e.base, e.draft, paths), draft: e.draft }))
  }

  // Saves the given changed paths, merged into the LIVE settings, so a key
  // someone else changed meanwhile is not overwritten with this page's copy.
  const savePaths = async (paths) => {
    if (loadFailed) throw new Error("Settings could not be loaded, so nothing can be saved. Reload the page.")
    const next = mergePaths(settings, draft, paths)
    await repo.saveSettings(next)
    setEdit((e) => ({ base: mergePaths(e.base, e.draft, paths), draft: e.draft }))
  }

  const save = async () => {
    setSaving(true)
    try {
      if (changes.length) await savePaths(changes)
      if (cchanges.length) await saveCompanyPaths(cchanges)
      toast.success("Settings saved")
    } catch (e) {
      toast.error(e.message || "Could not save the settings")
    } finally {
      setSaving(false)
    }
  }
  const discard = () => {
    setEdit({ base: settings, draft: structuredClone(settings) })
    setCedit(null)
  }
  const go = (id) => {
    if (id === section) return
    // Embedded sections lose their edits when they unmount; the shared draft
    // follows only to the other draft sections, where its bar is shown.
    const losing = embeddedDirty || (allChanges.length > 0 && !DRAFT_SECTIONS.includes(id))
    if (losing && !window.confirm("You have unsaved changes. Leave this section and discard them?")) return
    if (losing) {
      setUnsaved({})
      if (!DRAFT_SECTIONS.includes(id)) discard()
    }
    setParams(id === "company" ? {} : { section: id }, { replace: true })
  }
  // A list changes by index (company.paymentAliases.2): name the list.
  const changedWords = allChanges.map((p) => PATH_LABEL[p] || PATH_LABEL[p.replace(/\.\d+$/, "")] || p.split(".").pop()).filter((v, i, a) => a.indexOf(v) === i)

  const indiamartOn = !!draft.integrations.indiamart.enabled && !!draft.integrations.indiamart.crmKey
  const editing = companiesOn && cedit ? { draft: cedit.draft, set: setC } : { draft, set }
  const picker = companiesOn && chosen && (
    <CompanyPicker companies={companies} value={chosen.id} onChange={pickCompanyToEdit} />
  )
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
          {loadFailed && DRAFT_SECTIONS.includes(section) && (
            <Banner tone="danger" className="mb-5">
              The saved settings could not be loaded, so this page shows the defaults. Saving is off until they load: reload the page.
            </Banner>
          )}
          <UnsavedContext.Provider value={report}>
          {section === "companies" && <CompaniesSection companies={companies} onEdit={(id) => (pickCompanyToEdit(id), go("company"))} />}
          {section === "company" && <CompanySection draft={editing.draft} set={editing.set} picker={picker} perCompany={companiesOn} companyId={chosen?.id} />}
          {section === "documents" && <DocumentsSection draft={editing.draft} set={editing.set} picker={picker} perCompany={companiesOn} />}
          {section === "notifications" && <NotificationsSection draft={draft} set={set} setEmailjs={setEmailjs} />}
          {section === "integrations" && (
            <IntegrationsSection draft={draft} settings={settings} setPath={setPath} changes={changes} savePaths={savePaths} loadFailed={loadFailed} companies={companies} />
          )}
          {/* These three were whole pages of their own. They keep their own
              cards and their own save buttons; only their address changed. */}
          {section === "attendance" && (
            <SectionHead title="Attendance & leave" description="The rules every clock-in, day status and leave request is judged by.">
              <AttendanceSettings />
            </SectionHead>
          )}
          {section === "payroll" && (
            <SectionHead title="Payroll" description="Pay schedule, overtime, the bank file and the name on payslips.">
              <PayrollSettings />
            </SectionHead>
          )}
          {section === "access" && (
            <SectionHead title="Modules & roles" description="Who can open what: each module for the company, for a role, and for one person.">
              <Modules embedded />
            </SectionHead>
          )}
          {section === "data" && <DataSection />}
          </UnsavedContext.Provider>
        </div>
      </div>

      {/* ---- unsaved changes: only where this bar is what saves them ---- */}
      {allChanges.length > 0 && DRAFT_SECTIONS.includes(section) && (
        <div className="squircle fixed bottom-5 left-1/2 z-30 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-foreground py-2.5 pl-[18px] pr-2.5 text-primary-foreground animate-pop-in lg:left-[calc(50%+116px)]">
          <span className="h-2 w-2 flex-none rounded-full bg-warning" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {allChanges.length === 1 ? "1 unsaved change" : `${allChanges.length} unsaved changes`}
            <span className="opacity-60"> · {changedWords.slice(0, 3).join(", ")}{changedWords.length > 3 ? "…" : ""}</span>
          </span>
          <Button variant="dark" size="sm" onClick={discard}>
            Discard
          </Button>
          <Button variant="outline" size="sm" onClick={save} disabled={saving || loadFailed} title={loadFailed ? "Settings could not be loaded" : undefined}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
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

function CompanySection({ draft, set, picker, perCompany, companyId }) {
  const c = draft.company
  const [showAcct, setShowAcct] = useState(false)
  const gstin = String(c.gstin || "").trim().toUpperCase()
  const gstOk = GSTIN_RE.test(gstin)
  const gstState = gstOk ? gstin.slice(0, 2) : null
  const stateMismatch = gstOk && c.stateCode && String(c.stateCode).padStart(2, "0") !== gstState
  const acct = String(c.bankAccount || "")

  return (
    <SectionHead title="Company" description={perCompany ? "How this company appears on its quotations, invoices and receipts." : "How your business appears on quotations and invoices."}>
      {picker}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Group title="Business details" description="Printed at the top of every document.">
            <Row label="Company name">
              <Input value={c.name} onChange={(e) => set("company", "name", e.target.value)} />
            </Row>
            {perCompany && (
              <Row label="Short name" hint="On the company tag in lists, and the logo text">
                <Input value={c.logoText || ""} onChange={(e) => set("company", "logoText", e.target.value)} className="max-w-[220px]" />
              </Row>
            )}
            <Row label="Tagline" hint="Optional, under the name">
              <Input value={c.tagline} onChange={(e) => set("company", "tagline", e.target.value)} />
            </Row>
            <Row label="GSTIN" hint="15 characters">
              <Input
                value={c.gstin}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase()
                  set("company", "gstin", v)
                  // The state follows a valid GSTIN: its first two digits are the state code.
                  if (GSTIN_RE.test(v.trim())) set("company", "stateCode", v.trim().slice(0, 2))
                }}
              />
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
            <Row label="Website" hint="Optional">
              <Input value={c.website || ""} onChange={(e) => set("company", "website", e.target.value)} />
            </Row>
            {perCompany && (
              <Row label="Tally company name" hint="As it is named in TallyPrime. An import warns when the files come from another company">
                <Input value={draft.tallyCompany || ""} onChange={(e) => set(null, "tallyCompany", e.target.value)} />
              </Row>
            )}
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
          <DocumentPreview company={c} companyId={companyId} prefix={draft.numbering.quotationPrefix} />
          <p className="squircle flex items-start gap-2.5 rounded-xl bg-primary/10 px-3.5 py-3 text-[12.5px] font-medium text-primary">
            <ShieldCheck className="mt-0.5 h-[18px] w-[18px] flex-none" />
            Only the Super Admin can change these. {perCompany ? "Everyone who works in this company can read them." : "Admins can read them."}
          </p>
        </aside>
      </div>
    </SectionHead>
  )
}

function DocumentPreview({ company: c, companyId, prefix }) {
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
          <CompanyMark companyId={companyId} company={c} className="h-[34px] w-auto max-w-[96px] flex-none object-contain" />
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

// ---- Companies -------------------------------------------------------------------------

// Which company the Company and Documents sections edit.
function CompanyPicker({ companies, value, onChange }) {
  return (
    <div className="squircle flex flex-col gap-2 rounded-card bg-card px-6 py-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="sm:w-[170px] sm:flex-none">
        <div className="text-[13.5px] font-medium text-foreground">Company</div>
        <div className="mt-0.5 text-xs text-subtle-foreground">Whose details you are editing</div>
      </div>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="sm:max-w-[320px]">
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.active === false ? `${c.name} (switched off)` : c.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

// The companies run from this console (0075): add one, switch one off, order
// them, give each its logo (0078). Saved at once, one company at a time; each
// company's details are edited in Company and Documents.
function CompaniesSection({ companies, onEdit }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState("")
  const [logoFor, setLogoFor] = useState(null)
  const fileRef = useRef(null)
  const sorted = [...companies].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
  const newId = name.trim() ? companySlug(name, companies.map((c) => c.id)) : ""

  const write = async (key, row, done) => {
    setBusy(key)
    try {
      await repo.saveCompany(row)
      await reloadCompanies()
      if (done) toast.success(done)
      return true
    } catch (e) {
      toast.error(e?.message || "Could not save the company")
      return false
    } finally {
      setBusy("")
    }
  }

  const add = async () => {
    const n = name.trim()
    if (!n) return toast.error("Enter the company's name")
    const sort = Math.max(-1, ...companies.map((c) => c.sort ?? 0)) + 1
    if (await write("add", { id: newId, name: n, doc: { company: { name: n } }, active: true, sort }, `${n} added. Fill in its details in Company and Documents.`)) setName("")
  }

  const move = async (row, dir) => {
    const i = sorted.findIndex((c) => c.id === row.id)
    const other = sorted[i + dir]
    if (!other) return
    setBusy(`move-${row.id}`)
    try {
      // Positions, not the old sort values, so two equal sorts still swap.
      await repo.saveCompany({ ...row, sort: i + dir })
      await repo.saveCompany({ ...other, sort: i })
      await reloadCompanies()
    } catch (e) {
      toast.error(e?.message || "Could not reorder")
    } finally {
      setBusy("")
    }
  }

  const pickLogo = (row) => {
    setLogoFor(row)
    fileRef.current?.click()
  }

  const setLogo = async (file) => {
    const row = logoFor
    if (!row || !file) return
    setBusy(`logo-${row.id}`)
    try {
      const url = await uploadCompanyLogo(file, row.id)
      const old = row.doc?.company?.logoUrl
      await repo.saveCompany({ ...row, doc: { ...row.doc, company: { ...row.doc?.company, logoUrl: url } } })
      await reloadCompanies()
      if (old) void removeCompanyLogo(old)
      toast.success("Logo saved")
    } catch (e) {
      toast.error(e?.message || "Could not upload the logo")
    } finally {
      setBusy("")
    }
  }

  const removeLogo = async (row) => {
    const old = row.doc?.company?.logoUrl
    const company = { ...row.doc?.company }
    delete company.logoUrl
    if (await write(`logo-${row.id}`, { ...row, doc: { ...row.doc, company } }, "Logo removed")) {
      if (old) void removeCompanyLogo(old)
    }
  }

  if (!companies.length) {
    return (
      <SectionHead title="Companies" description="The companies run from this console.">
        <Banner tone="info">This database has no companies table yet (migration 0075). Until it is applied the console runs as one company.</Banner>
      </SectionHead>
    )
  }

  return (
    <SectionHead
      title="Companies"
      description="Each company keeps its own enquiries, customers, quotations, invoices, payments and document settings. The catalogue, staff, attendance, payroll and chat are shared."
    >
      <input
        ref={fileRef}
        type="file"
        accept={Object.keys(LOGO_TYPES).join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          void setLogo(f)
        }}
      />
      <Group title="Companies" description="Who works in which company is set on each person's page under Users. A company switched off is hidden from everyone but the Super Admin.">
        {sorted.map((row, i) => {
          const logo = row.doc?.company?.logoUrl
          return (
            <div key={row.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
              <CompanyMark companyId={row.id} company={{ ...row.doc?.company, name: row.name }} className="h-11 w-auto max-w-[120px] flex-none object-contain" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-foreground">{row.name}</span>
                  {row.active === false && <Pill>Off</Pill>}
                </div>
                <div className="text-xs text-subtle-foreground">
                  {row.id} · {logo ? "Own logo" : row.id === "ortex" ? "Ortex logo" : "Initials until a logo is added"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => pickLogo(row)}>
                  {busy === `logo-${row.id}` ? "Uploading…" : logo ? "Change logo" : "Add logo"}
                </Button>
                {logo && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => removeLogo(row)}>
                    Remove
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={!!busy || i === 0} onClick={() => move(row, -1)} aria-label={`Move ${row.name} up`}>
                  Up
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy || i === sorted.length - 1} onClick={() => move(row, 1)} aria-label={`Move ${row.name} down`}>
                  Down
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(row.id)}>
                  Edit details
                </Button>
                <Switch
                  checked={row.active !== false}
                  disabled={!!busy || row.id === "ortex"}
                  onChange={(v) => write(`active-${row.id}`, { ...row, active: v }, v ? `${row.name} switched on` : `${row.name} switched off`)}
                  label={`${row.name} is in use`}
                />
              </div>
            </div>
          )
        })}
      </Group>
      <Group title="Add a company" description="It starts with a name only: fill in its GSTIN, address, bank and wording before raising documents.">
        <Row label="Name" hint={newId ? `Its id will be ${newId}, which never changes` : "The registered name"}>
          <div className="flex gap-2.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Aman Enterprise" />
            <Button onClick={add} disabled={!!busy || !name.trim()}>
              {busy === "add" ? "Adding…" : "Add"}
            </Button>
          </div>
        </Row>
      </Group>
      <p className="text-xs text-subtle-foreground">Logos: PNG, JPG, SVG or WebP, square or wide, up to 1 MB. They print on every quotation, invoice and receipt of that company.</p>
    </SectionHead>
  )
}

// ---- Documents -------------------------------------------------------------------------

function DocumentsSection({ draft, set, picker, perCompany }) {
  const n = draft.numbering
  const fy = fyCode()
  return (
    <SectionHead title="Documents" description={perCompany ? "This company's defaults and printed wording for quotations, invoices and receipts." : "Defaults and printed wording for quotations, invoices and receipts."}>
      {picker}
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
        <Row label="Prices include tax" hint="Rates typed on a line already include GST">
          <Switch checked={!!draft.tax.pricesIncludeTax} onChange={(v) => set("tax", "pricesIncludeTax", v)} label="Prices include tax" />
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
                `Default terms and conditions pre-filled on every new sales quotation from ${draft.company.name || "the company"}: validity, payment, artwork approval, production time and delivery, one term per line`,
              context: () => ({ validityDays: draft.quotation.validityDays }),
              format: "lines",
              maxChars: 900,
            }}
            value={draft.quotation.terms}
            onChange={(e) => set("quotation", "terms", e.target.value)}
            className="min-h-[140px]"
          />
        </Row>
        <Row label="Closing line" hint="At the foot of every quotation">
          <Input value={draft.documents.quotationFooter} onChange={(e) => set("documents", "quotationFooter", e.target.value)} />
        </Row>
      </Group>
      <Group title="Invoice terms" description="Pre-filled on every new invoice, including one made from a quotation; each one can be edited. The invoice always prints Tax Invoice, Reverse charge and a signature block, as GST Rule 46 asks.">
        <Row label="Terms and conditions" hint="One term per line">
          <Textarea
            ai={{
              purpose:
                `Default terms and conditions printed on every GST tax invoice from ${draft.company.name || "the company"}: payment due date, quoting the invoice number, reporting shortage or damage, returns and jurisdiction, one term per line. Never quotation conditions such as artwork approval or taxes as applicable`,
              context: () => ({ jurisdiction: draft.company.address }),
              format: "lines",
              maxChars: 900,
            }}
            value={draft.documents.invoiceTerms}
            onChange={(e) => set("documents", "invoiceTerms", e.target.value)}
            className="min-h-[140px]"
          />
        </Row>
        <Row label="Closing line" hint="At the foot of every invoice">
          <Input value={draft.documents.invoiceFooter} onChange={(e) => set("documents", "invoiceFooter", e.target.value)} />
        </Row>
      </Group>
      <Group title="Payment receipts" description="Receipts and receipt vouchers for money received.">
        <Row label="Closing line" hint="At the foot of every receipt">
          <Input value={draft.documents.receiptFooter} onChange={(e) => set("documents", "receiptFooter", e.target.value)} />
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

// IndiaMART, one account per company (0075). The keys stay in the admin-only
// settings row, at integrations.indiamartByCompany[company id]; the old single
// block is Ortex's while indiamartByCompany.ortex does not exist (the
// indiamart-pull function reads it the same way). Before 0075: one card.
function indiamartPath(settings, companyId) {
  if (!companyId) return "integrations.indiamart"
  if (companyId === "ortex" && !settings.integrations?.indiamartByCompany?.ortex) return "integrations.indiamart"
  return `integrations.indiamartByCompany.${companyId}`
}
const atPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj)

function IndiaMartCard({ company, path, draft, settings, setPath, changes, savePaths, loadFailed }) {
  const im = { crmKey: "", enabled: false, ...atPath(draft, path) }
  // What the server last wrote (lastPull, lastResult), not the draft's copy.
  const imLive = atPath(settings, path) || {}
  const [syncing, setSyncing] = useState(false)
  const [editingKey, setEditingKey] = useState(!im.crmKey)
  const imPaths = changes.filter((p) => p === path || p.startsWith(`${path}.`))
  const imOn = !!im.enabled && !!im.crmKey

  // Saves ONLY this account's changes, merged into the saved settings: anything
  // else still unsaved on this page stays a draft.
  const syncNow = async () => {
    setSyncing(true)
    try {
      if (imPaths.length) await savePaths(imPaths) // the server pulls with the saved key
      const res = await syncIndiaMart(company?.id)
      if (res.error) toast.error(res.error)
      else if (res.skipped) toast.message(res.reason || "IndiaMART sync is off")
      else toast.success(`IndiaMART: ${res.inserted} new lead(s) imported${res.duplicates ? `, ${res.duplicates} already had` : ""}`)
    } catch (e) {
      toast.error(e.message || "Could not save the IndiaMART settings")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <IntegrationCard
      icon={Inbox}
      tone="blue"
      title={company ? `IndiaMART, ${company.name}` : "IndiaMART leads"}
      description={company ? `Imports buyer enquiries from ${company.name}'s IndiaMART account into its own Leads.` : "Imports buyer enquiries into Enquiries."}
      status={imOn ? ["On", "green"] : im.crmKey ? ["Off", "slate"] : ["No key", "amber"]}
      facts={[
        ["Last sync", imLive.lastPull ? new Date(imLive.lastPull).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"],
        ["Result", imLive.lastResult || "No sync yet"],
      ]}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
        <span className="text-[13px] font-medium text-foreground">Sync new leads</span>
        <Switch checked={!!im.enabled} onChange={(v) => setPath(`${path}.enabled`, v)} label={`Enable IndiaMART lead sync${company ? ` for ${company.name}` : ""}`} />
      </div>
      {editingKey ? (
        <Input
          type="password"
          value={im.crmKey}
          onChange={(e) => setPath(`${path}.crmKey`, e.target.value)}
          placeholder="CRM / Pull API key (Lead Manager → CRM Integration)"
        />
      ) : null}
      {company && (
        <div className="text-xs text-subtle-foreground">
          Push webhook for this account:
          <code className="mt-1 block break-all rounded-lg bg-subtle px-2.5 py-2 text-[11.5px] text-foreground">{indiamartHook(company.id)}</code>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || !im.crmKey || (loadFailed && imPaths.length > 0)}>
          <RefreshCw className="h-4 w-4" /> {syncing ? "Syncing…" : imPaths.length ? "Save IndiaMART and sync now" : "Sync now"}
        </Button>
        {!editingKey && (
          <Button size="sm" variant="outline" onClick={() => setEditingKey(true)}>
            Change key
          </Button>
        )}
      </div>
    </IntegrationCard>
  )
}

function IntegrationsSection({ draft, settings, setPath, changes, savePaths, loadFailed, companies }) {
  const { items: usage, error: usageError, loading: usageLoading } = useCollection("ai_usage")
  const provider = settings.telecaller?.provider || "simulate"

  // Only successful calls are logged (logAiUsage), so recent rows show it
  // works; no rows, or rows that cannot be read, prove nothing either way.
  const ai = useMemo(() => {
    const rows = usage || []
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    const last = rows.reduce((m, r) => (r.createdAt && (!m || r.createdAt > m) ? r.createdAt : m), null)
    return {
      tokens: rows.reduce((a, r) => a + (Number(r.totalTokens) || 0), 0),
      month: rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= monthStart).length,
      model: rows.find((r) => r.model)?.model || "Not recorded",
      last,
    }
  }, [usage])
  const recent = ai.last && Date.now() - new Date(ai.last).getTime() < 7 * 86400000
  const aiStatus = usageError || usageLoading || !ai.last ? ["Not checked", "slate"] : recent ? ["Working", "green"] : ["Idle", "amber"]
  const nf = (n) => (Number(n) || 0).toLocaleString("en-IN")
  const cards = companies.length ? companies.map((c) => ({ company: c, path: indiamartPath(settings, c.id) })) : [{ company: null, path: "integrations.indiamart" }]

  return (
    <SectionHead title="Integrations" description="What the console is connected to, and whether each connection is working.">
      <div className="grid gap-5 lg:grid-cols-2">
        {cards.map(({ company, path }) => (
          <IndiaMartCard key={company?.id || "one"} company={company} path={path} draft={draft} settings={settings} setPath={setPath} changes={changes} savePaths={savePaths} loadFailed={loadFailed} />
        ))}

        <IntegrationCard
          icon={Sparkles}
          tone="violet"
          title="AI assistant"
          description="Gemini writes copy and powers Anu. Product photo edits run on Cloudflare."
          status={aiStatus}
          facts={[
            ["Calls this month", usageError ? "Not readable" : nf(ai.month)],
            ["Last call", ai.last ? new Date(ai.last).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "None recorded"],
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
              if (window.confirm("Delete ALL data: products, enquiries, quotations, invoices, payments and settings? This cannot be undone.")) {
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
