import { useState, useMemo, useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowDownLeft, FileText, Eye, FileCheck2, Trash2, AlertTriangle, Send, MessageCircle, Mail, Printer, MoreHorizontal, Clock, PhoneOutgoing, Calendar, Copy, CheckCircle2, ArrowRight } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSettingsFor } from "../hooks/useCollection"
import { useCompany } from "../hooks/useCompany"
import { CompanyField } from "../components/ui/CompanyChip"
import { useProfile } from "../hooks/useProfile"
import useQuotationDefaults from "../hooks/useQuotationDefaults"
import { withDefaults } from "../lib/quotationDefaults"
import { clearDraft, draftHasContent, draftKey, isDirty, readDraft, writeDraft } from "../lib/quotationDraft"
import { errorsUnder, tidyDocument } from "../lib/validateDocument"
import useDocumentValidation from "../hooks/useDocumentValidation"
import FixSummary from "../components/editors/FixSummary"
import { currentUserId } from "../lib/auth"
import { createQuotation, updateQuotation, markEnquiryQuoted, markLeadQuoted, isInterState, sameCustomer } from "../data/domain/domain"
import { QUOTATION_STATUS, LOST_REASONS, newCustomer, newLine, newProduct } from "../data/domain/schema"
import { canAccess } from "../data/domain/modules"
import { amountInWords } from "../lib/format"
import { stateName } from "../lib/gstStates"
import { computeDocument } from "../lib/pricing"
import { cn } from "../lib/cn"
import { QUOTE_TONE, quoteChecks, quoteFollowUp, quoteStatus, validityLeft, dueLabel, rupees, tomorrowAt10 } from "../lib/salesWork"
import CustomerPicker from "../components/editors/CustomerPicker"
import ShipToFields from "../components/editors/ShipToFields"
import LineItemsEditor from "../components/editors/LineItemsEditor"
import DocumentView from "../components/documents/DocumentView"
import { callContact } from "../components/sales/ContactCard"
import { RecordActivity } from "../components/ui/RecordActivity"
import { isAdmin as isAdminRole } from "../lib/roles"
import { Avatar, Button, Chip, Kbd, Modal, Banner, PageLoader } from "../components/ui/Ui"
import { ActionMenu, StatusDropdown } from "../components/sales/ListParts"
import { StatusTimeline, StickyActionBar } from "../components/sales/StatusTimeline"
import QuotationList from "./quotations/QuotationList"
import SendScreen from "./quotations/SendScreen"
import { downloadPdf, duplicateDraft, extendValidity, setQuoteStatus, startWhatsAppShare } from "./quotations/actions"
import { useConvertConfirm } from "./quotations/ConvertDialog"
import TermsCard from "./quotations/TermsCard"
import { averageDiscount, readyItems, taxBases } from "./quotations/model"

const emptyDraft = (settings, companyId = "") => ({
  id: null,
  // The company it is raised for (0075); "" in All mode until chosen. Fixed once created.
  companyId,
  customer: newCustomer(),
  shipTo: null,
  lines: [newLine()],
  extraDiscountPercent: 0,
  paymentTerms: "",
  issueDate: new Date().toISOString(),
  validityDays: settings?.quotation?.validityDays ?? 15,
  notes: "",
  terms: settings?.quotation?.terms ?? "",
  status: "draft",
  lostReason: "",
  enquiryId: null,
  leadId: null,
  // Stamped from the signed-in profile in the editor, not here: this factory is
  // pure and does not know who is at the keyboard. See `sellerName` on the
  // quotation doc, mirrored in Ortex.Mobile/src/domain/schema.ts.
  sellerName: "",
  showSeller: true,
})

const dm = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

export default function Quotations() {
  const { items, loading } = useCollection("quotations")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const { items: enquiries } = useCollection("enquiries")
  const { items: invoices } = useCollection("invoices")
  const settingsOf = useSettingsFor()
  const { defaultCompany } = useCompany()
  // The list and a new draft use the company in view; a record, its own.
  const settings = settingsOf?.(defaultCompany) ?? null
  const profile = useProfile()
  // The signed-in person's own payment terms / T&C / notes (Profile > Quotation
  // defaults), laid over the company's for a NEW quotation only. An existing
  // quotation always keeps the text it was saved with.
  const { defaults: quoteDefaults } = useQuotationDefaults(profile)
  const newDraft = (patch = {}) => {
    const companyId = patch.companyId ?? defaultCompany
    return { ...withDefaults(emptyDraft(settingsOf(companyId), companyId), quoteDefaults), ...patch }
  }
  // What "Reset to my defaults" puts back, for the company a quotation is for.
  const defaultsOf = (companyId) => {
    const { paymentTerms, terms, notes, validityDays } = newDraft({ companyId })
    return { paymentTerms, terms, notes, validityDays }
  }
  const location = useLocation()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(null) // draft object or null
  const [preview, setPreview] = useState(null)
  const [sendId, setSendId] = useState(null) // quotation id on the send screen
  const sending = sendId ? items.find((q) => q.id === sendId) || null : null

  // Router state handoffs:
  //  - fromEnquiry / fromLead: prefill a new quotation from a "Convert to
  //    quotation" action.
  //  - fromCustomer: start a blank quotation for a customer-master record.
  //  - openId: open an existing quotation (links from Customers / Products);
  //    with `send`, straight onto its send screen.
  //  - create: a blank quotation (the header's "+ New" menu).
  useEffect(() => {
    // Wait for the profile too: it carries the quotation defaults to seed with.
    if (!settings || !profile) return
    const { fromEnquiry, fromLead, fromCustomer, openId, create, send } = location.state || {}
    // A quotation from a lead or a customer belongs to THEIR company.
    const fromCompany = location.state?.companyId || (fromEnquiry || fromLead)?.companyId
    if (create) {
      setEditing(newDraft())
      navigate(location.pathname, { replace: true })
    } else if (fromEnquiry || fromLead) {
      const src = fromEnquiry || fromLead
      const base = newDraft(fromCompany ? { companyId: fromCompany } : {})
      setEditing({
        ...base,
        customer: { ...newCustomer(), ...src.customer },
        // A voice lead arrives with the product and quantity Anu captured, so it
        // can seed the first line and leave only the rate to fill in. Sources
        // without line detail keep the empty draft's blank row.
        lines: src.lines?.length ? src.lines : base.lines,
        enquiryId: fromEnquiry?.id || null,
        leadId: fromLead?.id || null,
        notes: [src.message ? `Ref: ${src.message}` : "", base.notes].filter(Boolean).join("\n"),
      })
      navigate(location.pathname, { replace: true })
    } else if (fromCustomer) {
      setEditing(newDraft({ customer: { ...newCustomer(), ...fromCustomer }, ...(fromCompany ? { companyId: fromCompany } : {}) }))
      navigate(location.pathname, { replace: true })
    } else if (openId) {
      if (loading) return // wait for the collection, the effect re-runs when it lands
      const q = items.find((x) => x.id === openId)
      if (!q) toast.error("That quotation no longer exists")
      else if (send) setSendId(q.id)
      else setEditing({ ...q })
      navigate(location.pathname, { replace: true })
    }
    // newDraft is rebuilt every render; quoteDefaults is the input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, settings, profile, quoteDefaults, navigate, items, loading])

  if (!settings || !profile) return <PageLoader />

  const sendScreen = sending && <SendScreen q={sending} settings={settingsOf(sending.companyId)} onClose={() => setSendId(null)} onEdit={() => (setEditing({ ...sending }), setSendId(null))} />

  if (editing) {
    return (
      <div>
        <QuotationEditor
          key={editing.id || "new"}
          draft={editing}
          products={products}
          customers={customers}
          enquiries={enquiries}
          quotations={items}
          invoices={invoices}
          settingsOf={settingsOf}
          defaultsOf={defaultsOf}
          profile={profile}
          onClose={() => setEditing(null)}
          onOpen={(q) => setEditing(q)}
          onPreview={(q) => setPreview(q)}
          onSend={(q) => setSendId(q.id)}
        />
        <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settingsOf(preview?.companyId)} type="quotation" />
        {sendScreen}
      </div>
    )
  }

  return (
    <>
      <QuotationList
        items={items}
        loading={loading}
        settingsOf={settingsOf}
        enquiries={enquiries}
        invoices={invoices}
        onOpen={(q) => setEditing(q.id ? { ...q } : newDraft(q))}
        onNew={() => setEditing(newDraft())}
        onSend={(q) => setSendId(q.id)}
        onPreview={(q) => setPreview(q)}
      />
      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settingsOf(preview?.companyId)} type="quotation" onShareWhatsApp={(q) => startWhatsAppShare(q, settingsOf(q.companyId))} />
      {sendScreen}
    </>
  )
}

function savedAtLabel(ts) {
  if (!ts) return "earlier"
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

function resumeParty(stored) {
  const c = stored?.draft?.customer
  const name = c?.company || c?.name
  return name ? ` for ${name}` : ""
}

// The editable statuses; "expired" and "invoiced" happen on their own.
const PICKABLE = QUOTATION_STATUS.filter((s) => !["expired", "invoiced"].includes(s.id))

// One quotation (Figma "V2 · Quotation detail"): header with status and the
// send action, a progress track, the next action said once, the form on the
// left and sticky totals, send history, pre-send checks and the customer on the
// right. Saving stays explicit (the sticky bar), because a quotation is a
// document a customer receives, not a live record.
function QuotationEditor({ draft, products, customers: allCustomers, enquiries, quotations, invoices, settingsOf, defaultsOf, profile, onClose, onOpen, onPreview, onSend }) {
  const isEdit = !!draft.id
  // Deleting a quotation is admin-only IN THE DATABASE as of migration 0022
  // (`admin_quotations_delete`). Without this check a Sales Executive still sees
  // the button and gets an RLS error for pressing it, which reads as a bug
  // rather than as a permission.
  const isAdmin = isAdminRole(profile)
  // A new quotation starts with the signed-in user's name as the seller; it is
  // an ordinary field after that, editable on create and edit alike.
  const [start] = useState(() => (isEdit || draft.sellerName ? draft : { ...draft, sellerName: profile?.name?.trim() || "" }))
  const [form, setForm] = useState(start)
  // What the form was opened with, moved forward whenever the screen persists
  // it (send, a status change), so "unsaved changes" means exactly that.
  const [baseline, setBaseline] = useState(start)
  const dirty = isDirty(form, baseline)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [savedAt, setSavedAt] = useState(isEdit ? draft.updatedAt : null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [tab, setTab] = useState("details")
  const [menu, setMenu] = useState(null)
  const [open, setOpen] = useState({ customer: !isEdit && !draft.customer?.name, ship: false, terms: false, notes: false })
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // ---- Local draft (lib/quotationDraft.js) --------------------------------
  // Per user + per quotation. Offered back once on open: for an existing
  // quotation when the stored copy differs from the record, for a new one only
  // when this is a blank start (a conversion or a customer handoff arrives with
  // its own content and is not interrupted).
  const storageKey = draftKey(currentUserId(), draft.id)
  const [resume, setResume] = useState(() => {
    const stored = readDraft(storageKey)
    if (!stored) return null
    if (isEdit) return isDirty(stored.draft, draft) ? stored : null
    const blankStart = !draftHasContent(draft) && !draft.enquiryId && !draft.leadId
    return blankStart && draftHasContent(stored.draft) ? stored : null
  })
  // Set once the draft has been saved or thrown away, so the unmount flush
  // below cannot write it back.
  const finished = useRef(false)
  const latest = useRef({ form, dirty, resume })
  latest.current = { form, dirty, resume }

  useEffect(() => {
    if (resume) return // the offer is pending: never overwrite what it offers
    if (!dirty) {
      // An existing quotation back at its saved state has nothing to resume. A
      // new one is left alone, so opening a blank editor never wipes a draft.
      if (isEdit) clearDraft(storageKey)
      return
    }
    const handle = setTimeout(() => writeDraft(storageKey, form), 400)
    return () => clearTimeout(handle)
  }, [form, dirty, resume, isEdit, storageKey])

  // Leaving by any route (sidebar, closed tab) flushes the debounce, and a tab
  // close asks first while there is something unsaved.
  useEffect(() => {
    const flush = () => {
      const l = latest.current
      if (!finished.current && l.dirty && !l.resume) writeDraft(storageKey, l.form)
    }
    const onUnload = (e) => {
      if (!latest.current.dirty || finished.current) return
      flush()
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      flush()
    }
  }, [storageKey])

  // A send, a status change or an edit from another tab updates the stored
  // record; carry the fields this screen does not edit into the baseline so
  // they are not reported as unsaved changes.
  const stored = isEdit ? quotations.find((q) => q.id === draft.id) : null
  useEffect(() => {
    if (!stored) return
    const pick = ({ status, sentAt, sendLog, statusAt, followUpAt, lostReason, invoiceId, validityDays, validUntil }) => ({ status, sentAt, sendLog, statusAt, followUpAt, lostReason, invoiceId, validityDays, validUntil })
    setBaseline((b) => ({ ...b, ...pick(stored) }))
    setForm((f) => ({ ...f, ...pick(stored) }))
    setSavedAt(stored.updatedAt)
  }, [stored])

  const discardDraft = () => {
    finished.current = true
    clearDraft(storageKey)
  }

  const requestClose = () => {
    if (dirty && !saving) setConfirmLeave(true)
    else onClose()
  }
  const [showLost, setShowLost] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  // Everything company-specific (state for GST, terms, prefixes, the printed
  // header) follows the company the quotation is for.
  const settings = settingsOf(form.companyId)
  const customers = useMemo(() => (form.companyId ? allCustomers.filter((m) => !m.companyId || m.companyId === form.companyId) : allCustomers), [allCustomers, form.companyId])
  // A new quotation moved to another company takes that company's defaults,
  // unless the text was already changed by hand.
  const pickCompany = (companyId) => {
    const next = settingsOf(companyId)
    setForm((f) => ({
      ...f,
      companyId,
      ...(f.terms === settings.quotation.terms ? { terms: next.quotation.terms } : {}),
      ...(f.validityDays === settings.quotation.validityDays ? { validityDays: next.quotation.validityDays } : {}),
    }))
  }
  const interState = isInterState(settings.company.stateCode, form.shipTo?.stateCode || form.customer.stateCode)
  const supplyState = form.shipTo?.stateCode || form.customer.stateCode
  const status = isEdit ? quoteStatus(form) : form.status
  const c = form.customer || {}
  const partyLabel = c.company || c.name

  // Live document: what the customer will receive, computed from the form as
  // it is right now (valid-until follows issue date + validity like createQuotation).
  const liveDoc = useMemo(() => {
    const validUntil = form.issueDate && form.validityDays ? new Date(new Date(form.issueDate).getTime() + form.validityDays * 86400000).toISOString() : form.validUntil
    return { ...form, validUntil, totals: computeDocument(form.lines, { interState, extraDiscountPercent: form.extraDiscountPercent }) }
  }, [form, interState])
  const t = liveDoc.totals
  const left = validityLeft(liveDoc)
  const fu = isEdit ? quoteFollowUp(liveDoc) : null
  const checks = useMemo(() => quoteChecks(liveDoc, settings), [liveDoc, settings])
  // Field rules (lib/validateDocument.js): errors block Save, warnings are said.
  const { on: companiesOn } = useCompany()
  const v = useDocumentValidation(liveDoc, { kind: "quotation", products, companyRequired: !isEdit && companiesOn })
  const shownUnder = (prefix) => Object.keys(v.shown).some((k) => k.startsWith(prefix))
  // Show every problem and open the folded parts that hold one.
  const revealAll = () => {
    const keys = Object.keys(v.errors)
    setOpen((o) => ({ ...o, customer: o.customer || keys.some((k) => k.startsWith("customer.")), ship: o.ship || keys.some((k) => k.startsWith("shipTo.")) }))
    v.reveal()
  }
  const lead = form.enquiryId ? enquiries.find((e) => e.id === form.enquiryId) : null
  const party = useMemo(() => {
    const c = form.customer || {}
    const qs = quotations.filter((q) => sameCustomer(c, q.customer))
    const won = qs.filter((q) => ["accepted", "invoiced"].includes(q.status))
    const billed = invoices.filter((i) => i.status !== "cancelled" && sameCustomer(c, i.customer)).reduce((s, i) => s + (Number(i.totals?.grandTotal) || 0), 0)
    const master = customers.find((m) => sameCustomer(c, m))
    return { count: qs.length, won: won.length, billed, master }
  }, [quotations, invoices, customers, form.customer])

  // Persist the form. Returns the saved quotation (or null on failure) and
  // never closes the editor; `save` below decides what happens next.
  const persist = async () => {
    if (saving) return null
    if (v.count) {
      revealAll()
      return null
    }
    // Stored trimmed; the form takes the same text so it is not left "unsaved".
    const clean = tidyDocument(form)
    setSaving(true)
    setSaveError("")
    let saved = null
    try {
      saved = isEdit ? await updateQuotation(form.id, clean) : await createQuotation(clean)
    } catch (e) {
      // Nothing was saved. The form and its local draft stay exactly as they
      // are, so nothing typed is lost and Save can simply be pressed again.
      const message = e?.message || "Could not save the quotation"
      setSaveError(message)
      toast.error(message)
      setSaving(false)
      return null
    }
    // The quotation EXISTS from here on, so nothing below may read as a failed
    // save: that makes someone press Save again and mint a second number.
    discardDraft()
    if (isEdit) {
      setForm(clean)
      setBaseline(clean)
      toast.success("Quotation saved")
    } else {
      let followUp = ""
      try {
        if (form.enquiryId) await markEnquiryQuoted(form.enquiryId)
        if (form.leadId) await markLeadQuoted(form.leadId, saved.id)
      } catch {
        followUp = " The enquiry could not be marked as quoted."
      }
      toast[followUp ? "message" : "success"](`Quotation ${saved.number} created.${followUp}`)
    }
    setSaving(false)
    return saved
  }

  const save = async () => {
    const saved = await persist()
    if (!saved) return
    if (isEdit) setSavedAt(new Date().toISOString())
    else onOpen({ ...saved })
  }

  // Send needs a saved quotation that matches the screen.
  const saveThenSend = async () => {
    if (!isEdit || dirty) {
      const saved = await persist()
      if (!saved) return
      if (!isEdit) return onOpen({ ...saved }), onSend(saved)
    }
    onSend(form)
  }

  const saveAndPreview = async () => {
    if (dirty || !isEdit) {
      if (v.count) return revealAll()
      await save()
    }
    onPreview(liveDoc)
  }

  const changeStatus = async (next) => {
    if (next === "rejected") return setShowLost(true)
    set({ status: next })
    if (isEdit) {
      await setQuoteStatus(form, next)
      setBaseline((b) => ({ ...b, status: next }))
    }
  }

  const confirmReject = async (reason) => {
    set({ status: "rejected", lostReason: reason })
    setShowLost(false)
    if (isEdit) {
      await setQuoteStatus(form, "rejected", { lostReason: reason })
      setBaseline((b) => ({ ...b, status: "rejected", lostReason: reason }))
    }
  }

  const convertConfirm = useConvertConfirm()
  const convert = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    if (dirty && !(await persist())) return
    convertConfirm.ask({ ...form, totals: t }, () => onClose())
  }

  // Admin-only in the database (0022) and on screen (isAdmin above).
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    setDeleting(true)
    try {
      await repo.remove("quotations", form.id)
      discardDraft()
      toast.success("Quotation deleted")
      setConfirmDelete(false)
      onClose()
    } catch (err) {
      toast.error(err?.message || "Could not delete the quotation")
    } finally {
      setDeleting(false)
    }
  }

  const snooze = async () => {
    const when = tomorrowAt10()
    set({ followUpAt: when })
    if (isEdit) {
      await repo.update("quotations", form.id, { followUpAt: when })
      setBaseline((b) => ({ ...b, followUpAt: when }))
    }
    toast.success("Follow-up moved to tomorrow")
  }

  const lineCount = form.lines.filter((l) => l.description || l.quantity).length
  const sentVia = [...new Set((form.sendLog || []).map((l) => (l.channel === "whatsapp" ? "WhatsApp" : "email")))].join(" + ")
  const track = [
    { id: "draft", label: "Draft", when: form.createdAt || form.issueDate },
    { id: "sent", label: sentVia ? `Sent · ${sentVia}` : "Sent", when: form.sentAt || form.statusAt?.sent },
    { id: "accepted", label: "Accepted", when: form.statusAt?.accepted },
    { id: "invoiced", label: "Invoiced", when: form.statusAt?.invoiced },
  ]
  // A rejected quotation shows how far it got: accepted if dated, else sent if it went out.
  const reached = status === "rejected" ? (form.statusAt?.accepted ? 2 : form.sentAt || form.sendLog?.length ? 1 : 0) : ({ draft: 0, sent: 1, expired: 1, accepted: 2, invoiced: 3 }[status] ?? 0)
  const trackEnd =
    status === "rejected"
      ? { label: `Lost${form.lostReason ? `: ${form.lostReason}` : ""}`, tone: "rose", when: form.statusAt?.rejected }
      : status === "expired"
        ? { label: "Lapsed", tone: "amber", when: form.validUntil }
        : null
  const log = [...(form.sendLog || [])].reverse()
  const bad = checks.filter((x) => !x.ok)

  // ---- V3 builder: rail, jumps, shortcuts ----------------------------------
  const guide = Number(settings?.quotation?.discountGuidePct ?? 5)
  const ready = readyItems({ checks, errors: v.shown, warnings: v.warnings, lines: form.lines, guide })
  const readyOk = ready.filter((x) => x.tone === "ok").length
  const bases = taxBases(t)
  const avgDisc = averageDiscount(t)

  // Scroll to and focus the field a Fix / Review link is about, opening the
  // folded part that holds it first.
  const jumpTo = (path) => {
    if (!path) return
    if (path.startsWith("customer.")) setOpen((o) => ({ ...o, customer: true }))
    if (path.startsWith("shipTo.")) setOpen((o) => ({ ...o, ship: true }))
    setTab("details")
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = v.rootRef.current?.querySelector(`[data-path="${path}"]`)
        if (!el) return
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        const control = el.matches("input, textarea, button") ? el : el.querySelector("input, textarea, button")
        control?.focus({ preventScroll: true })
      }),
    )
  }

  // A custom line kept for next time: a DRAFT product, off the website, with
  // the line's HSN, unit, rate and GST. Writing products needs the Catalogue
  // module in the database too; this only decides whether to offer it.
  const saveToCatalogue = canAccess(profile, "products")
    ? async (line) => {
        try {
          const p = await repo.create("products", newProduct({ name: line.description.trim(), hsn: line.hsn || "", unit: line.unit || "pcs", basePrice: Number(line.rate) || 0, gstRate: Number(line.gstRate) || 0, status: "draft", showOnWebsite: false }))
          toast.success(`${p.name} saved to the catalogue as a draft`)
          return p
        } catch (e) {
          toast.error(e?.message || "Could not save it to the catalogue")
          return null
        }
      }
    : undefined

  const [createMenu, setCreateMenu] = useState(null)
  const createAnd = async (then) => {
    const saved = await persist()
    if (!saved) return
    onOpen({ ...saved })
    then?.(saved)
  }
  const createSections = [
    {
      items: [
        { icon: Eye, label: "Create and preview", onSelect: () => createAnd((q) => onPreview(q)) },
        { icon: Printer, label: "Create and download PDF", onSelect: () => createAnd((q) => downloadPdf(q, settings)) },
        { icon: FileText, label: "Create as draft", hint: "Send later", onSelect: () => createAnd() },
      ],
    },
  ]

  // "/" adds an item, Ctrl+S saves, Ctrl+Enter saves and sends. Never while a
  // dialog is open, and "/" never while typing.
  const keys = useRef(null)
  keys.current = {
    save: () => (dirty || !isEdit) && save(),
    send: () => !["invoiced", "rejected"].includes(status) && (status === "accepted" ? convert() : saveThenSend()),
  }
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        keys.current.save()
      } else if (mod && e.key === "Enter") {
        e.preventDefault()
        keys.current.send()
      } else if (e.key === "/" && !mod && !e.target.closest?.("input, textarea, select, [contenteditable='true']")) {
        const add = v.rootRef.current?.querySelector("[data-add-item] [role='combobox']")
        if (add) {
          e.preventDefault()
          add.click()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [v.rootRef])

  const moreSections = [
    {
      items: [
        { icon: Eye, label: "Preview", onSelect: () => onPreview(liveDoc) },
        { icon: Printer, label: "Download PDF", onSelect: () => downloadPdf(liveDoc, settings) },
        ...(isEdit ? [{ icon: Calendar, label: "Extend validity", hint: "+15 days", disabled: !["draft", "sent", "expired"].includes(status), onSelect: () => extendValidity(form, 15) }] : []),
        ...(isEdit ? [{ icon: Copy, label: "Duplicate as new draft", onSelect: () => onOpen(duplicateDraft(form)) }] : []),
        ...(isEdit && status === "accepted" ? [{ icon: FileCheck2, label: "Convert to invoice", onSelect: convert }] : []),
      ],
    },
  ]

  return (
    // At least one window tall, so the sticky action bar rests on the bottom edge.
    <div ref={v.rootRef} onBlurCapture={v.onBlurCapture} className="flex min-h-[calc(100dvh-76px)] flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <button type="button" onClick={requestClose} aria-label="Back to quotations" title="Back to quotations" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-line bg-card text-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ArrowLeft variant="Linear" className="h-4 w-4" />
          </button>
          <button type="button" onClick={requestClose} className="hover:text-foreground">Quotations</button>
          <span>/</span>
          <span className="font-medium text-foreground">{isEdit ? draft.number : "New quotation"}</span>
        </div>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {dirty ? (
            <><span className="h-2 w-2 rounded-full bg-warning" /> Unsaved changes</>
          ) : savedAt ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> Saved {savedAtLabel(savedAt)}</>
          ) : (
            "Not saved yet"
          )}
        </span>
      </div>

      {/* Header. A new quotation (V3 builder) has no status or send history
          yet: its title, the company it is for and Preview; every create
          action lives with the total in the rail. */}
      {!isEdit ? (
        <header className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.01em] text-foreground">New quotation</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
              <span>Its number is given when you create it</span>
              {lead && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link to={`/enquiries/${lead.id}`} className="font-medium text-primary hover:underline">
                    From lead {lead.reference || lead.customer?.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <CompanyField value={form.companyId} onChange={pickCompany} className="w-64" />
          <Button variant="outline" onClick={() => onPreview(liveDoc)}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
        </header>
      ) : (
      <section className="squircle rounded-card bg-card px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="squircle grid h-[52px] w-[52px] flex-none place-items-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold leading-8 tracking-[-0.01em] text-foreground tabular">{isEdit ? draft.number : "New quotation"}</h1>
              {isEdit &&
                (["expired", "invoiced"].includes(status) ? (
                  <StatusDropdown value={status} statuses={QUOTATION_STATUS} tones={QUOTE_TONE} onChange={changeStatus} />
                ) : (
                  <StatusDropdown value={status} statuses={PICKABLE} tones={QUOTE_TONE} onChange={changeStatus} />
                ))}
            </div>
            <p className="mt-1 truncate text-[13px] text-muted-foreground">
              {[partyLabel || "No customer yet", c.company && c.name, rupees(t.grandTotal) + " incl. GST", lead?.reference && `from ${lead.reference}`, form.sellerName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => onPreview(liveDoc)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            {isEdit && (
              <div className="squircle flex overflow-hidden rounded-xl border border-line">
                <SegIcon icon={MessageCircle} label="WhatsApp" green onClick={saveThenSend} />
                <SegIcon icon={Mail} label="Email" onClick={saveThenSend} className="border-x border-line" />
                <SegIcon icon={Printer} label="Download PDF" onClick={() => downloadPdf(liveDoc, settings)} />
              </div>
            )}
            {status !== "invoiced" && status !== "rejected" && (
              <Button onClick={status === "accepted" ? convert : saveThenSend} disabled={saving}>
                {status === "accepted" ? <FileCheck2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {status === "accepted" ? "Convert to invoice" : status === "draft" || !isEdit ? "Send" : "Send reminder"}
              </Button>
            )}
            <Button variant="outline" icon onClick={(e) => setMenu(e.currentTarget)} aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isEdit && (
          <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
            <StatusTimeline
              label="Quotation status timeline"
              steps={track}
              reached={reached}
              end={trackEnd}
              // Invoiced happens by converting, and nothing moves backwards off an invoice.
              canPick={(id) => id !== "invoiced" && status !== "invoiced"}
              onPick={(id) => id !== status && changeStatus(id)}
            />
            {!["rejected", "invoiced"].includes(status) && (
              <button type="button" onClick={() => changeStatus("rejected")} className="squircle h-6 flex-none rounded-lg border border-destructive/30 px-2.5 text-xs font-medium text-destructive-text hover:bg-destructive/[0.06]">
                Mark as lost
              </button>
            )}
          </div>
        )}
      </section>
      )}

      {/* Next action */}
      {fu && fu.label && fu.group !== "closed" && (
        <section className="squircle relative flex flex-wrap items-center gap-4 overflow-hidden rounded-card bg-card py-4 pl-9 pr-4">
          <span className={cn("absolute bottom-3 left-4 top-3 w-[3px] rounded-full", fu.overdue ? "bg-destructive" : fu.group === "needs" ? "bg-warning" : "bg-primary")} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.06em]", fu.overdue ? "text-destructive-text" : "text-muted-foreground")}>Next action</span>
              <span className="font-semibold text-foreground">
                {fu.action === "send"
                  ? "Send this quotation today."
                  : fu.action === "invoice"
                    ? "Accepted. Convert it to an invoice."
                    : fu.overdue
                      ? `Follow-up is ${dueLabel(fu.due).replace("Overdue ", "")} overdue.`
                      : `Follow up ${dueLabel(fu.due).toLowerCase()}.`}
                {form.sentAt && fu.action === "remind" ? ` Sent ${dm(form.sentAt)}${log.length > 1 ? `, ${log.length} times so far` : ""}.` : ""}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {left != null && status === "sent" && (
                <Pillish tone={left <= 3 ? "amber" : "slate"} icon={Calendar}>{left < 0 ? "Validity lapsed" : `Valid ${left} more day${left === 1 ? "" : "s"}`}</Pillish>
              )}
              {bad.map((x) => (
                <Pillish key={x.key} tone="amber" icon={AlertTriangle}>{x.text}</Pillish>
              ))}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {fu.action === "remind" && (
              <Button variant="outline" onClick={snooze}>
                <Clock className="h-4 w-4" /> Snooze
              </Button>
            )}
            {c.phone && (
              <Button variant="outline" onClick={(ev) => callContact(ev, { name: c.name, company: c.company, phone: c.phone, email: c.email })}>
                <PhoneOutgoing className="h-4 w-4" /> Call {c.name?.split(" ")[0] || ""}
              </Button>
            )}
            {fu.action === "invoice" ? (
              <Button onClick={convert}>
                <FileCheck2 className="h-4 w-4" /> Convert to invoice
              </Button>
            ) : (
              <Button onClick={saveThenSend}>
                <MessageCircle className="h-4 w-4" /> {fu.action === "send" ? "Send" : "WhatsApp reminder"}
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 [&>*:first-child]:!mb-0">
          {isEdit && (
            <div className="squircle flex items-center gap-6 rounded-t-card border-b border-border bg-card px-[18px]">
              {[
                { key: "details", label: "Details" },
                { key: "activity", label: "Activity" },
              ].map((x) => (
                <button key={x.key} type="button" onClick={() => setTab(x.key)} className={cn("-mb-px h-12 border-b-2 text-[13px] font-medium", tab === x.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {x.label}
                </button>
              ))}
            </div>
          )}

          {tab === "activity" && isEdit ? (
            <Box attached title="Change history" sub="Who changed this quotation, and when.">
              <RecordActivity collection="quotations" record={draft} bare title="" />
            </Box>
          ) : (
            <>
              <Box
                attached={isEdit}
                title="Customer and place of supply"
                sub="Who it is for, and where the goods go. The state decides the GST."
                action={<TextBtn onClick={() => toggle("customer")}>{open.customer ? "Done" : partyLabel ? "Change" : "Add customer"}</TextBtn>}
              >
                {(open.customer || shownUnder("customer.")) && (
                  <div className="mb-4">
                    <CustomerPicker value={form.customer} onChange={(customer) => set({ customer })} customers={customers} errors={errorsUnder(v.shown, "customer")} warnings={errorsUnder(v.shownWarnings, "customer")} />
                  </div>
                )}
                {partyLabel ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={partyLabel} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-foreground">{c.company || c.name}</p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
                        <span>{[c.company && c.name, c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email yet"}</span>
                        {c.gstin && (
                          <span className="inline-flex items-center gap-1">
                            · GSTIN {c.gstin}
                            {!v.errors["customer.gstin"] && <CheckCircle2 className="h-3.5 w-3.5 text-success-text" aria-label="GSTIN check digit valid" />}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  !open.customer && <p className="text-[13px] text-muted-foreground">No customer yet. Add one to set the place of supply.</p>
                )}
                <div className="squircle mt-4 grid grid-cols-1 overflow-hidden rounded-xl bg-muted text-[12.5px] leading-5 md:grid-cols-2">
                  <div className="px-4 py-3 md:border-r md:border-line">
                    <p className="flex items-center justify-between text-muted-foreground">
                      Ship to <TextBtn onClick={() => toggle("ship")}>{open.ship ? "Done" : "Change"}</TextBtn>
                    </p>
                    {form.shipTo ? (
                      <>
                        <b className="block font-medium text-foreground">{form.shipTo.company || form.shipTo.name || "Delivery address"}</b>
                        {form.shipTo.address && <span className="block truncate text-muted-foreground">{form.shipTo.address}</span>}
                      </>
                    ) : (
                      <>
                        <b className="block font-medium text-foreground">Same as billing</b>
                        {c.address && <span className="block truncate text-muted-foreground">{c.address}</span>}
                      </>
                    )}
                  </div>
                  <div className={cn("px-4 py-3", !supplyState && "bg-warning/10")}>
                    <p className="text-muted-foreground">Place of supply</p>
                    {supplyState ? (
                      <>
                        <b className="block font-medium text-foreground">
                          {stateName(supplyState) || "State"} ({supplyState})
                        </b>
                        <span className="block font-medium text-success-text">
                          {interState ? `Inter-state from ${stateName(settings.company.stateCode) || "your state"} · IGST applies` : "Same state as yours · CGST + SGST apply"}
                        </span>
                      </>
                    ) : (
                      <span className="block text-warning-text">Add the customer&apos;s state or GSTIN to decide IGST or CGST + SGST.</span>
                    )}
                  </div>
                </div>
                {(open.ship || shownUnder("shipTo.")) && (
                  <div className="mt-4 border-t border-border pt-4">
                    <ShipToFields value={form.shipTo} onChange={(shipTo) => set({ shipTo })} customers={customers} errors={errorsUnder(v.shown, "shipTo")} warnings={errorsUnder(v.shownWarnings, "shipTo")} />
                  </div>
                )}
              </Box>

              <Box
                title="Items"
                sub="Pick from the catalogue to fill HSN, rate and GST, or type any name for a one-off item."
                action={lead?.lines?.length > 0 && <TextBtn onClick={() => set({ lines: [...form.lines.filter((l) => l.description?.trim() || l.productId), ...lead.lines] })}>Import from lead</TextBtn>}
              >
                <LineItemsEditor
                  lines={form.lines}
                  onChange={(lines) => set({ lines })}
                  products={products}
                  extraDiscountPercent={form.extraDiscountPercent}
                  onExtraDiscountChange={(x) => set({ extraDiscountPercent: x })}
                  interState={interState}
                  showTotals={false}
                  errors={v.shown}
                  warnings={v.shownWarnings}
                  onSaveToCatalogue={saveToCatalogue}
                />
              </Box>

              <TermsCard form={form} set={set} v={v} validUntil={liveDoc.validUntil} left={left} defaults={defaultsOf(form.companyId)} />
            </>
          )}
        </div>

        {/* Rail */}
        <div className="space-y-4 xl:sticky xl:top-[72px] xl:self-start">
          <RailCard title="Totals" action={supplyState && <span className="rounded-md bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{interState ? "IGST · inter-state" : "CGST + SGST"}</span>}>
            <dl className="space-y-2 text-[13px]">
              <Line label={`Subtotal (${lineCount} line${lineCount === 1 ? "" : "s"})`} value={rupees2(t.subTotal)} />
              {t.lineDiscount > 0 && <Line label="Line discounts" value={`−${rupees2(t.lineDiscount)}`} good />}
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  Extra discount
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.extraDiscountPercent || 0}
                    onChange={(e) => set({ extraDiscountPercent: Number(e.target.value) })}
                    aria-label="Extra discount percent"
                    data-path="extraDiscountPercent"
                    aria-invalid={v.shown.extraDiscountPercent ? true : undefined}
                    className="h-6 w-12 rounded-md border border-line bg-card px-1.5 text-right text-xs text-foreground outline-none focus:border-primary aria-invalid:border-destructive"
                  />
                  %
                </dt>
                <dd className={cn("font-medium tabular", t.docDiscount > 0 ? "text-success-text" : "text-muted-foreground")}>{t.docDiscount > 0 ? `−${rupees2(t.docDiscount)}` : "-"}</dd>
              </div>
              {v.shown.extraDiscountPercent && <p className="text-xs text-destructive-text">{v.shown.extraDiscountPercent}</p>}
              <Line label="Taxable value" value={rupees2(t.taxable)} />
              {Object.entries(t.taxByRate || {})
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([rate, amt]) => (
                  <Line key={rate} label={`${interState ? "IGST" : "CGST + SGST"} ${rate}% on ${rupees(bases[rate])}`} value={rupees2(amt)} />
                ))}
              {t.roundOff !== 0 && <Line label="Round off" value={`${t.roundOff > 0 ? "+" : "−"}${rupees2(Math.abs(t.roundOff))}`} />}
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-[14px] font-semibold text-foreground">Grand total</span>
              <span className="text-[28px] font-semibold tracking-[-0.02em] text-foreground tabular">{rupees(t.grandTotal)}</span>
            </div>
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{amountInWords(t.grandTotal)}</p>
            {avgDisc > 0 && (
              <p className={cn("squircle mt-3 rounded-lg px-3 py-2 text-[12px] font-medium", form.lines.some((l) => Number(l.discountPercent) > guide) ? "bg-warning/10 text-warning-text" : "bg-success/[0.08] text-success-text")}>
                Average discount {avgDisc}%
              </p>
            )}

            {/* A new quotation's actions sit with its total (V3): one primary
                action, the rest behind More. An existing one keeps the bar. */}
            {!isEdit && (
              <div className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={saveThenSend} disabled={saving}>
                    <Send className="h-4 w-4" /> {saving ? "Creating…" : "Create and send"}
                  </Button>
                  <Button variant="outline" icon onClick={(e) => setCreateMenu(e.currentTarget)} disabled={saving} aria-label="More ways to create">
                    <ArrowDownLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={save} disabled={saving}>
                    Create as draft
                  </Button>
                  <Button variant="outline" onClick={() => onPreview(liveDoc)}>
                    <Eye className="h-4 w-4" /> Preview
                  </Button>
                </div>
                <div className="pt-1 text-xs">
                  {saveError ? (
                    <span className="font-medium text-destructive-text" role="alert">Not saved: {saveError}</span>
                  ) : v.count && dirty ? (
                    // The full list is in Ready to send; this says how many and shows them.
                    <button type="button" onClick={revealAll} className="inline-flex items-center gap-1.5 font-medium text-destructive-text hover:underline">
                      <AlertTriangle className="h-3.5 w-3.5" /> {v.count} thing{v.count === 1 ? "" : "s"} to fix before creating
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", dirty ? "bg-warning" : "bg-border-strong")} /> {dirty ? "Not created yet · kept in this browser" : "Nothing entered yet"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </RailCard>

          <RailCard title="Ready to send" action={<span className="text-xs text-muted-foreground tabular">{readyOk} of {ready.length}</span>}>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={ready.length} aria-valuenow={readyOk} aria-label="Ready to send">
              <div className={cn("h-full rounded-full transition-[width]", ready.some((x) => x.tone === "bad") ? "bg-warning" : "bg-success")} style={{ width: `${ready.length ? (readyOk / ready.length) * 100 : 0}%` }} />
            </div>
            <ul className="space-y-2 text-[12.5px]">
              {ready.map((x) => (
                <li key={x.key} className={cn("flex items-start gap-2", x.tone === "ok" ? "text-foreground" : x.tone === "warn" ? "text-warning-text" : "text-destructive-text")}>
                  {x.tone === "ok" ? <CheckCircle2 className="mt-px h-4 w-4 flex-none text-success-text" /> : <AlertTriangle className="mt-px h-4 w-4 flex-none" />}
                  <span className="min-w-0 flex-1">{x.text}</span>
                  {x.act && x.path && (
                    <button type="button" onClick={() => jumpTo(x.path)} className="flex-none text-[12px] font-medium text-primary hover:underline">
                      {x.act}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">Warnings never block. Errors stop Create and are listed here first.</p>
          </RailCard>

          {isEdit && (
            <RailCard title="Sent" action={<span className="text-xs text-muted-foreground">{log.length ? `${log.length} time${log.length === 1 ? "" : "s"}` : ""}</span>}>
              {log.length ? (
                <ul className="space-y-2.5">
                  {log.slice(0, 5).map((l, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px]">
                      {l.channel === "whatsapp" ? <MessageCircle className="mt-0.5 h-4 w-4 flex-none text-success-text" /> : <Mail className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />}
                      <span>
                        <b className="block font-semibold text-foreground">{l.channel === "whatsapp" ? "Sent on WhatsApp" : "Emailed with PDF"}</b>
                        <span className="text-[11px] text-muted-foreground">
                          {savedAtLabel(l.at)}
                          {l.to ? ` · ${l.to}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">Not sent yet. Send it from here and every send is listed.</p>
              )}
            </RailCard>
          )}

          {isEdit && partyLabel && party.count > 0 && (
            <RailCard title={partyLabel} action={party.master && <Link to={`/customers/${party.master.id}`} className="text-[12.5px] font-medium text-primary hover:underline">Open customer</Link>}>
              <div className="grid grid-cols-3 gap-2">
                <Mini label="Quotes" value={party.count} />
                <Mini label="Won" value={`${party.won} · ${Math.round((party.won / party.count) * 100)}%`} />
                <Mini label="Billed" value={compactRs(party.billed)} />
              </div>
              {lead && (
                <Link to={`/enquiries/${lead.id}`} className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-primary hover:underline">
                  From lead {lead.reference || lead.customer?.name} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </RailCard>
          )}

          <ul className="space-y-1.5 px-1 text-[12px] text-muted-foreground" aria-label="Keyboard shortcuts">
            <li className="flex items-center gap-2"><Kbd>/</Kbd> Add an item</li>
            <li className="flex items-center gap-2"><Kbd>Ctrl S</Kbd> {isEdit ? "Save" : "Create as draft"}</li>
            <li className="flex items-center gap-2"><Kbd>Ctrl Enter</Kbd> {isEdit && status === "accepted" ? "Convert to invoice" : isEdit ? "Save and send" : "Create and send"}</li>
          </ul>
        </div>
      </div>

      {isEdit && (
      <StickyActionBar
        left={
          isAdmin && (
            <Button variant="dangerGhost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete quotation
            </Button>
          )
        }
      >
        <span className="mr-1 inline-flex min-w-0 items-center gap-1.5">
          {saveError ? (
            <span className="font-medium text-destructive-text" role="alert">Not saved: {saveError}</span>
          ) : v.count && dirty ? (
            <FixSummary v={v} />
          ) : dirty ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-warning-text"><span className="h-2 w-2 rounded-full bg-warning" /> Unsaved changes</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> {lineCount} line{lineCount === 1 ? "" : "s"} · {rupees(t.grandTotal)} incl. GST · all changes saved</span>
          )}
        </span>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => (setForm(baseline), discardDraft(), (finished.current = false))}>
            Discard
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={requestClose}>
          Close
        </Button>
        {dirty && (
          <Button variant="outline" size="sm" onClick={save} disabled={saving || v.count > 0} title={v.count ? v.first : undefined}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
        <Button size="sm" onClick={saveAndPreview} disabled={saving}>
          <Eye className="h-3.5 w-3.5" /> {dirty ? "Save and preview" : "Preview"}
        </Button>
      </StickyActionBar>
      )}

      <ActionMenu open={!!menu} anchor={menu} onClose={() => setMenu(null)} sections={moreSections} width={240} />
      <ActionMenu open={!!createMenu} anchor={createMenu} onClose={() => setCreateMenu(null)} sections={createSections} width={260} />
      {convertConfirm.element}
      <Modal
        open={confirmDelete}
        onClose={deleting ? () => {} : () => setConfirmDelete(false)}
        title="Delete this quotation?"
        width="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={remove} disabled={deleting}>{deleting ? "Deleting…" : "Delete quotation"}</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">{[draft.number, partyLabel].filter(Boolean).join(" · ")}</p>
          <p className="text-muted-foreground">Its number is not reused, so the series will show a gap. Invoices already made from it are kept.</p>
          <p className="text-destructive-text">This cannot be undone.</p>
        </div>
      </Modal>

      <Modal
        open={!!resume}
        onClose={() => setResume(null)}
        title="Continue where you left off?"
        width="max-w-md"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearDraft(storageKey)
                setResume(null)
              }}
            >
              {isEdit ? "Discard those changes" : "Start fresh"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (resume) setForm({ ...draft, ...resume.draft })
                setResume(null)
              }}
            >
              Continue
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? `You have unsaved changes to this quotation in this browser, from ${savedAtLabel(resume?.savedAt)}.`
            : `You have an unfinished quotation${resumeParty(resume)} in this browser, from ${savedAtLabel(resume?.savedAt)}.`}
        </p>
        {isEdit && resume?.draft?.updatedAt && draft.updatedAt && resume.draft.updatedAt !== draft.updatedAt && (
          <Banner tone="warning" className="mt-3">
            This quotation has been saved again since then. Continuing puts your older changes back over it.
          </Banner>
        )}
      </Modal>

      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave without saving?"
        width="max-w-md"
        footer={
          <>
            <Button variant="dangerGhost" size="sm" onClick={() => { discardDraft(); setConfirmLeave(false); onClose() }}>
              Discard changes
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setConfirmLeave(false); onClose() }}>
              Keep draft and leave
            </Button>
            <Button size="sm" onClick={() => setConfirmLeave(false)}>
              Keep editing
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {isEdit ? "Your changes to this quotation have not been saved." : "This quotation has not been created yet."} If you keep the draft, it stays in this browser and is offered back when you open {isEdit ? "this quotation" : "a new quotation"} again.
        </p>
      </Modal>

      <Modal open={showLost} onClose={() => setShowLost(false)} title="Why was this quotation lost?" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip key={r} onClick={() => confirmReject(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ---- pieces ---------------------------------------------------------------

const rupees2 = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

function compactRs(v) {
  const n = Number(v) || 0
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  return rupees(n)
}

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

function RailCard({ title, action, children }) {
  return (
    <section className="squircle rounded-card bg-card p-[18px]">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="truncate text-[14px] font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

const Line = ({ label, value, good }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={cn("font-medium tabular", good ? "text-success-text" : "text-foreground")}>{value}</dd>
  </div>
)

const Mini = ({ label, value }) => (
  <div className="squircle min-w-0 rounded-xl bg-muted px-2.5 py-2">
    <div className="truncate text-[11px] text-muted-foreground">{label}</div>
    <div className="truncate text-[14px] font-semibold text-foreground tabular">{value}</div>
  </div>
)

const TextBtn = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="flex-none text-[12.5px] font-medium text-primary hover:underline">
    {children}
  </button>
)

function Pillish({ tone, icon: Icon, children }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", tone === "amber" ? "bg-warning/12 text-warning-text" : "bg-background text-muted-foreground")}>
      <Icon className="h-3 w-3" /> {children}
    </span>
  )
}

function SegIcon({ icon: Icon, label, onClick, green, className }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cn("grid h-10 w-11 place-items-center bg-card transition-colors hover:bg-muted", green ? "text-success-text" : "text-muted-foreground", className)}>
      <Icon className="h-4 w-4" />
    </button>
  )
}
