import { useState, useMemo, useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { FileText, Plus, Eye, FileCheck2, Trash2, AlertTriangle, Send, CalendarClock, Search, MessageCircle, Phone } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import useQuotationDefaults from "../hooks/useQuotationDefaults"
import { withDefaults } from "../lib/quotationDefaults"
import { clearDraft, draftHasContent, draftKey, isDirty, readDraft, saveBlocker, writeDraft } from "../lib/quotationDraft"
import { currentUserId } from "../lib/auth"
import { createQuotation, updateQuotation, convertQuotationToInvoice, markEnquiryQuoted, markLeadQuoted, isInterState } from "../data/domain/domain"
import { notifyMessage, notifyQuotationSent } from "../services/notify"
import { QUOTATION_STATUS, LOST_REASONS, newCustomer, newLine } from "../data/domain/schema"
import { formatDate, toDateInput, daysUntil, formatCurrency } from "../lib/format"
import { exportCsv } from "../lib/csv"
import CustomerPicker from "../components/editors/CustomerPicker"
import LivePreview from "../components/editors/LivePreview"
import { computeDocument } from "../lib/pricing"
import { cn } from "../lib/cn"
import ShipToFields from "../components/editors/ShipToFields"
import LineItemsEditor from "../components/editors/LineItemsEditor"
import DocumentView from "../components/documents/DocumentView"
import { abandonWhatsAppShare, beginWhatsAppShare, shareQuotationOnWhatsApp } from "../components/documents/documentPdf"
import { hasPhone, quotationShareMessage, telLink, whatsappLink } from "../lib/quotationShare"
import { RecordActivity } from "../components/ui/RecordActivity"
import ListTextarea from "../components/ui/ListTextarea"
import { EditorHeader, Tiles, Tile, Section, EditorFooter } from "../components/editors/DocumentEditorShell"
import { isAdmin as isAdminRole } from "../lib/roles"
import {
  Button, ExportButton,
  Card, CardHeader,
  Input, SearchInput,
  Field,
  StatusBadge,
  EmptyState,
  Money,
  Chip, ChipGroup,
  Modal,
  Banner,
  PageLoader,
  SortTh,
} from "../components/ui/Ui"

const emptyDraft = (settings) => ({
  id: null,
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

// Status as shown in the UI: a "sent" quote whose validity has lapsed reads as
// "expired" without a background job mutating the stored record.
function displayStatus(q) {
  if (q.status !== "sent" || !q.validUntil) return q.status
  const left = daysUntil(q.validUntil)
  return left !== null && left < 0 ? "expired" : q.status
}

// Email the quotation (EmailJS or mailto per settings) and, if it was still a
// draft or had lapsed, mark it "sent". Returns true when the send went through.
async function sendQuotation(q, settings) {
  if (!q?.id) {
    toast.error("Save the quotation first")
    return false
  }
  const res = await notifyQuotationSent(q, settings)
  const m = notifyMessage(res)
  if (res?.error) {
    toast.error(m?.text || res.error)
    return false
  }
  if (m) toast[m.tone === "success" ? "success" : "message"](m.text)
  if (["draft", "expired", "sent"].includes(q.status)) await repo.update("quotations", q.id, { status: "sent" })
  return true
}

// Share the PDF with the customer on WhatsApp, and mark a draft "sent" the way
// the email send does. `ctx` comes from beginWhatsAppShare, which the click
// handler must call before its first await (popup and clipboard rules).
// documentPdf.jsx explains why the PDF cannot be put into the chat itself.
// Returns true when something went out (share sheet completed or chat opened).
async function shareOnWhatsApp(q, settings, ctx) {
  let res
  try {
    res = await shareQuotationOnWhatsApp(ctx, { doc: q, settings, waUrl: whatsappLink(q.customer?.phone, ctx.message) })
  } catch (err) {
    console.error(err)
    toast.error("Could not generate the PDF.")
    return false
  }
  if (res.outcome === "cancelled") return false
  const copied = res.copied ? "The message is copied too, paste it as the caption." : undefined
  if (res.outcome === "shared") {
    toast.success("Quotation shared", { description: copied })
  } else if (!res.url) {
    toast.message(`${res.fileName} downloaded`, { description: "No phone number on this quotation, so no chat was opened." })
    return false
  } else if (res.opened) {
    toast.success("PDF downloaded, attach it in the chat", { description: res.copied ? "The message is typed in and also copied." : undefined })
  } else {
    toast.message("PDF downloaded, attach it in the chat", {
      description: "The browser blocked the new tab.",
      action: { label: "Open WhatsApp", onClick: () => window.open(res.url, "_blank") },
    })
  }
  if (["draft", "expired"].includes(q.status)) await repo.update("quotations", q.id, { status: "sent" })
  return true
}

function startWhatsAppShare(q, settings) {
  const ctx = beginWhatsAppShare(quotationShareMessage(q, settings), { openChat: hasPhone(q.customer?.phone) })
  return shareOnWhatsApp(q, settings, ctx)
}

export default function Quotations() {
  const { items, loading } = useCollection("quotations")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const settings = useSettings()
  const profile = useProfile()
  // The signed-in person's own payment terms / T&C / notes (Profile > Quotation
  // defaults), laid over the company's for a NEW quotation only. An existing
  // quotation always keeps the text it was saved with.
  const { defaults: quoteDefaults } = useQuotationDefaults(profile)
  const newDraft = (patch = {}) => ({ ...withDefaults(emptyDraft(settings), quoteDefaults), ...patch })
  const location = useLocation()
  const navigate = useNavigate()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState(null) // draft object or null
  const [preview, setPreview] = useState(null)
  const [sort, onSort] = useSorting("issueDate", true)

  // Router state handoffs:
  //  - fromEnquiry / fromLead: prefill a new quotation from a "Convert to
  //    quotation" action.
  //  - fromCustomer: start a blank quotation for a customer-master record.
  //  - openId: open an existing quotation (links from Customers / Products).
  useEffect(() => {
    // Wait for the profile too: it carries the quotation defaults to seed with.
    if (!settings || !profile) return
    const { fromEnquiry, fromLead, fromCustomer, openId } = location.state || {}
    if (fromEnquiry || fromLead) {
      const src = fromEnquiry || fromLead
      const base = newDraft()
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
      setEditing(newDraft({ customer: { ...newCustomer(), ...fromCustomer } }))
      navigate(location.pathname, { replace: true })
    } else if (openId) {
      if (loading) return // wait for the collection, the effect re-runs when it lands
      const q = items.find((x) => x.id === openId)
      if (q) setEditing({ ...q })
      else toast.error("That quotation no longer exists")
      navigate(location.pathname, { replace: true })
    }
    // newDraft is rebuilt every render; quoteDefaults is the input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, settings, profile, quoteDefaults, navigate, items, loading])

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter !== "all") rows = rows.filter((q) => displayStatus(q) === statusFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      rows = rows.filter((q) =>
        [q.number, q.customer?.name, q.customer?.company].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      let valA, valB
      if (key === "customer") {
        valA = a.customer?.company || a.customer?.name
        valB = b.customer?.company || b.customer?.name
      } else if (key === "grandTotal") {
        valA = a.totals?.grandTotal
        valB = b.totals?.grandTotal
      } else if (key === "issueDate" || key === "validUntil") {
        valA = a[key] ? new Date(a[key]).getTime() : 0
        valB = b[key] ? new Date(b[key]).getTime() : 0
      } else {
        valA = a[key]
        valB = b[key]
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return desc ? valB.localeCompare(valA) : valA.localeCompare(valB)
      return desc ? valB - valA : valA - valB
    })
    return sorted
  }, [items, query, statusFilter, sort])

  const handleExport = () => {
    exportCsv(
      `ortex-quotations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (q) => q.number },
        { header: "Date", value: (q) => formatDate(q.issueDate) },
        { header: "Customer", value: (q) => q.customer?.company || q.customer?.name },
        { header: "Status", value: (q) => displayStatus(q) },
        { header: "Taxable", value: (q) => q.totals?.taxable },
        { header: "Grand total", value: (q) => q.totals?.grandTotal },
        { header: "Valid until", value: (q) => formatDate(q.validUntil) },
      ],
      filtered,
    )
  }

  if (!settings || !profile) return <PageLoader />

  if (editing) {
    return (
      <div className="space-y-6">
        <QuotationEditor
          draft={editing}
          products={products}
          customers={customers}
          settings={settings}
          profile={profile}
          onClose={() => setEditing(null)}
          onPreview={(q) => setPreview(q)}
          onSend={(q) => sendQuotation(q, settings)}
          onShareWhatsApp={(q, ctx) => shareOnWhatsApp(q, settings, ctx)}
        />
        <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <ChipGroup className="min-w-0">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </Chip>
          {QUOTATION_STATUS.map((s) => (
            <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </Chip>
          ))}
        </ChipGroup>
        <div className="flex items-center gap-[10px] md:ml-auto">
          <SearchInput className="md:w-[320px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search quotations" />
          <ExportButton onClick={handleExport} disabled={!filtered.length} />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Create a quotation from scratch or convert an enquiry into one."
          action={
            <Button onClick={() => setEditing(newDraft())}>
              <Plus className="h-4 w-4" /> New quotation
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Quotations"
            action={<Button onClick={() => setEditing(newDraft())}>New quotation</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head">
                <tr>
                  <SortTh sortKey="number" sort={sort} onSort={onSort}>Number</SortTh>
                  <SortTh sortKey="customer" sort={sort} onSort={onSort}>Customer</SortTh>
                  <SortTh sortKey="grandTotal" sort={sort} onSort={onSort} align="right">Total</SortTh>
                  <SortTh sortKey="status" sort={sort} onSort={onSort}>Status</SortTh>
                  <SortTh sortKey="validUntil" sort={sort} onSort={onSort}>Validity</SortTh>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {filtered.map((q) => {
                  const left = daysUntil(q.validUntil)
                  const expiring = ["draft", "sent"].includes(q.status) && left !== null && left < 0
                  const canSend = ["draft", "sent"].includes(q.status)
                  return (
                    <tr key={q.id} className="cursor-pointer" onClick={() => setEditing({ ...q })}>
                      <td className="px-4 py-3 font-medium tabular text-foreground">{q.number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{q.customer?.company || q.customer?.name}</div>
                        <div className="text-xs text-muted-foreground">{q.customer?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        <Money value={q.totals?.grandTotal} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge list={QUOTATION_STATUS} status={displayStatus(q)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {expiring ? <span className="text-destructive">Expired {formatDate(q.validUntil)}</span> : formatDate(q.validUntil)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canSend && (
                            <Button
                              onClick={(ev) => {
                                ev.stopPropagation()
                                sendQuotation(q, settings)
                              }}
                              variant="ghost" size="sm" icon className="text-muted-foreground"
                              title={q.status === "sent" ? "Resend" : "Send"}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setPreview(q)
                            }}
                            variant="ghost" size="sm" icon className="text-muted-foreground"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <DocumentView
        open={!!preview}
        onClose={() => setPreview(null)}
        doc={preview}
        settings={settings}
        type="quotation"
        onShareWhatsApp={(q) => startWhatsAppShare(q, settings)}
      />
    </div>
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

function QuotationEditor({ draft, products, customers, settings, profile, onClose, onPreview, onSend, onShareWhatsApp }) {
  const isEdit = !!draft.id
  // Deleting a quotation is admin-only IN THE DATABASE as of migration 0022
  // (`admin_quotations_delete`). Without this check a Sales Executive still sees
  // the button and gets an RLS error for pressing it, which reads as a bug
  // rather than as a permission.
  const isAdmin = isAdminRole(profile)
  const [form, setForm] = useState(draft)
  // What the form was opened with, moved forward whenever the screen persists
  // it (send, a status change), so "unsaved changes" means exactly that.
  const [baseline, setBaseline] = useState(draft)
  const dirty = isDirty(form, baseline)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [confirmLeave, setConfirmLeave] = useState(false)

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

  const discardDraft = () => {
    finished.current = true
    clearDraft(storageKey)
  }

  const requestClose = () => {
    if (dirty && !saving) setConfirmLeave(true)
    else onClose()
  }
  // WHOSE NAME goes on the sheet. A new quotation takes the signed-in user's; an
  // existing one keeps the name it was raised under, because re-stamping it on
  // edit would quietly reassign a document that has already been sent.
  const sellerName = isEdit ? form.sellerName || "" : profile?.name?.trim() || ""
  const [showLost, setShowLost] = useState(false)
  const [moreOpen, setMoreOpen] = useState(Boolean(draft.shipTo || draft.notes))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const interState = isInterState(settings.company.stateCode, form.shipTo?.stateCode || form.customer.stateCode)
  const hasState = Boolean(form.shipTo?.stateCode || form.customer.stateCode)
  const status = isEdit ? displayStatus(form) : form.status
  const partyLabel = form.customer?.company || form.customer?.name

  // Live document: what the customer will receive, computed from the form as
  // it is right now (valid-until follows issue date + validity like createQuotation).
  const liveDoc = useMemo(() => {
    const validUntil = form.issueDate && form.validityDays ? new Date(new Date(form.issueDate).getTime() + form.validityDays * 86400000).toISOString() : form.validUntil
    return { ...form, validUntil, totals: computeDocument(form.lines, { interState, extraDiscountPercent: form.extraDiscountPercent }) }
  }, [form, interState])
  const validDays = liveDoc.validUntil ? daysUntil(liveDoc.validUntil) : null

  // Said beside the save button while it applies, not only as a toast after.
  const blocker = saveBlocker(form)

  const save = async () => {
    if (saving) return
    if (blocker) return toast.error(blocker)
    setSaving(true)
    setSaveError("")
    let created = null
    try {
      if (isEdit) await updateQuotation(form.id, form)
      else created = await createQuotation({ ...form, sellerName })
    } catch (e) {
      // Nothing was saved. The form and its local draft stay exactly as they
      // are, so nothing typed is lost and Save can simply be pressed again.
      const message = e?.message || "Could not save the quotation"
      setSaveError(message)
      toast.error(message)
      setSaving(false)
      return
    }
    // The quotation EXISTS from here on, so nothing below may read as a failed
    // save: that makes someone press Save again and mint a second number.
    discardDraft()
    if (isEdit) {
      toast.success("Quotation updated")
    } else {
      let followUp = ""
      try {
        if (form.enquiryId) await markEnquiryQuoted(form.enquiryId)
        if (form.leadId) await markLeadQuoted(form.leadId, created.id)
      } catch {
        followUp = " The enquiry could not be marked as quoted."
      }
      toast[followUp ? "message" : "success"](`Quotation ${created.number} created.${followUp}`)
    }
    setSaving(false)
    onClose()
  }

  const changeStatus = async (next) => {
    if (next === "rejected") {
      setShowLost(true)
      return
    }
    set({ status: next })
    if (isEdit) {
      await repo.update("quotations", form.id, { status: next })
      setBaseline((b) => ({ ...b, status: next }))
    }
  }

  const confirmReject = async (reason) => {
    set({ status: "rejected", lostReason: reason })
    setShowLost(false)
    if (isEdit) {
      await repo.update("quotations", form.id, { status: "rejected", lostReason: reason })
      setBaseline((b) => ({ ...b, status: "rejected", lostReason: reason }))
    }
  }

  // Persist any pending edits so the email carries what's on screen, then send.
  const send = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    const saved = await updateQuotation(form.id, form)
    // Everything on screen is persisted now, so it is no longer an unsaved draft.
    const next = { ...form }
    setBaseline(next)
    const ok = await onSend(saved || form)
    if (ok && ["draft", "expired", "sent"].includes(form.status)) {
      set({ status: "sent" })
      setBaseline({ ...next, status: "sent" })
    }
  }

  // Same shape as send: persist what is on screen, then share it. The share
  // context is taken BEFORE the save's await, because the WhatsApp tab and the
  // clipboard write both need the click still in hand.
  const [sharing, setSharing] = useState(false)
  const shareWhatsApp = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    if (blocker) return toast.error(blocker)
    if (sharing) return
    const ctx = beginWhatsAppShare(quotationShareMessage(liveDoc, settings), { openChat: canReach })
    setSharing(true)
    try {
      let saved
      try {
        saved = await updateQuotation(form.id, form)
      } catch (e) {
        abandonWhatsAppShare(ctx)
        return toast.error(e?.message || "Could not save the quotation")
      }
      const next = { ...form }
      setBaseline(next)
      const ok = await onShareWhatsApp(saved || liveDoc, ctx)
      if (ok && ["draft", "expired"].includes(form.status)) {
        set({ status: "sent" })
        setBaseline({ ...next, status: "sent" })
      }
    } finally {
      setSharing(false)
    }
  }
  const customerPhone = form.customer?.phone
  const canReach = hasPhone(customerPhone)

  const convert = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    const inv = await convertQuotationToInvoice(form.id)
    if (!inv) return toast.error("Could not convert this quotation to an invoice.")
    toast.success(`Invoice ${inv.number} generated`)
    const m = notifyMessage(inv._notify)
    if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
    onClose()
  }

  const remove = async () => {
    if (!window.confirm("Delete this quotation?")) return
    await repo.remove("quotations", form.id)
    discardDraft()
    toast.success("Quotation deleted")
    onClose()
  }

  const validityTone = status === "invoiced" || status === "accepted" ? "success" : validDays != null && validDays < 0 ? "danger" : validDays != null && validDays <= 3 ? "warning" : "info"
  const validitySub = validDays == null ? undefined : validDays < 0 ? `Expired ${-validDays}d ago` : validDays === 0 ? "Expires today" : `${validDays} day${validDays === 1 ? "" : "s"} left`
  const lineCount = form.lines.length
  const summary = `${lineCount} line${lineCount === 1 ? "" : "s"} · ${formatCurrency(liveDoc.totals.grandTotal)}`

  return (
    <div>
      <EditorHeader
        onBack={requestClose}
        backLabel="Back to quotations"
        title={isEdit ? `Quotation ${draft.number}` : "New quotation"}
        trail={["Sales", "Quotations", isEdit ? "Details" : "New"]}
        badge={<StatusBadge list={QUOTATION_STATUS} status={status} />}
        meta={isEdit ? `${partyLabel || "No customer"} · issued ${formatDate(form.issueDate)}` : `Draft · ${summary}`}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => onPreview(liveDoc)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            {isEdit && ["draft", "sent", "expired"].includes(form.status) && (
              <Button variant="outline" size="md" onClick={send}>
                <Send className="h-4 w-4" /> {form.status === "sent" ? "Resend" : "Send"}
              </Button>
            )}
            {isEdit && (
              <Button variant="outline" size="md" onClick={shareWhatsApp} disabled={sharing} title="Download the PDF and open the customer's WhatsApp chat">
                <MessageCircle className="h-4 w-4" /> {sharing ? "Preparing…" : "Share on WhatsApp"}
              </Button>
            )}
            {isEdit && form.status !== "invoiced" && (
              <Button variant="success" size="md" onClick={convert}>
                <FileCheck2 className="h-4 w-4" /> Convert to invoice
              </Button>
            )}
            <Button size="md" onClick={save} disabled={saving}>
              {isEdit ? "Save changes" : "Create quotation"}
            </Button>
          </>
        }
      />

      {isEdit && (
        <Tiles className="xl:grid-cols-3">
          <Tile icon={FileText} label="Quote value" value={formatCurrency(liveDoc.totals.grandTotal)} sub={`${summary.split(" · ")[0]} · ${interState ? "IGST" : "CGST + SGST"}`} />
          <Tile icon={CalendarClock} tone={validityTone} label="Valid until" value={liveDoc.validUntil ? formatDate(liveDoc.validUntil) : "-"} sub={validitySub} />
          <Tile
            icon={status === "invoiced" ? FileCheck2 : status === "rejected" ? AlertTriangle : Send}
            tone={status === "invoiced" || status === "accepted" ? "success" : status === "rejected" ? "danger" : status === "sent" ? "info" : "slate"}
            label="Status"
            value={QUOTATION_STATUS.find((s) => s.id === status)?.label || status}
            sub={status === "rejected" && form.lostReason ? `Lost: ${form.lostReason}` : form.invoiceId ? "Invoice generated" : undefined}
          />
        </Tiles>
      )}

      {/* Form left · live document right (Acctual / Mercury / Airwallex) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          {/* 1. Who */}
          <Section title="Customer" description="Who this quotation is for">
            <CustomerPicker value={form.customer} onChange={(customer) => set({ customer })} customers={customers} />
            {partyLabel && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={!canReach} onClick={() => { window.location.href = telLink(customerPhone) }}>
                  <Phone className="h-4 w-4" /> Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canReach}
                  onClick={() => window.open(whatsappLink(customerPhone, quotationShareMessage(liveDoc, settings)), "_blank", "noopener")}
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp message
                </Button>
                {!canReach && <span className="text-xs text-muted-foreground">No phone number on this customer. Add one to call or message.</span>}
              </div>
            )}
            {hasState && (
              <p className={cn("mt-3 text-xs font-medium", interState ? "text-primary" : "text-success-text")}>
                {interState ? "Inter-state supply - IGST will be applied." : "Intra-state supply - CGST + SGST will be applied."}
              </p>
            )}
          </Section>

          {/* 2. When / how - one compact row (Xero header row) */}
          <Section title="Details">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Issue Date">
                <Input type="date" value={toDateInput(form.issueDate)} onChange={(e) => set({ issueDate: new Date(e.target.value).toISOString() })} />
              </Field>
              <Field label="Validity (Days)">
                <Input type="number" min="1" value={form.validityDays} onChange={(e) => set({ validityDays: Number(e.target.value) })} />
              </Field>
              <Field label="Valid Until" hint="From issue date + validity">
                <Input readOnly value={liveDoc.validUntil ? formatDate(liveDoc.validUntil) : ""} />
              </Field>
              <Field label="Payment Terms">
                <Input value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="Enter payment terms" />
              </Field>
            </div>
            {/* WHO QUOTED IT, on the sheet the customer keeps. `sellerName` is
                stamped from the signed-in profile when the quotation is created
                and never re-stamped on edit, so it names the person who raised
                it rather than whoever last opened it. */}
            <label className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={form.showSeller !== false}
                onChange={(e) => set({ showSeller: e.target.checked })}
              />
              {sellerName ? `Show "Quoted by ${sellerName}" on the PDF` : "Show the seller's name on the PDF"}
            </label>
            {isEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">Mark as</span>
                {QUOTATION_STATUS.filter((s) => !["invoiced", "expired"].includes(s.id)).map((s) => (
                  <Chip key={s.id} active={form.status === s.id} onClick={() => changeStatus(s.id)}>
                    {s.label}
                  </Chip>
                ))}
                <span className="text-xs text-subtle-foreground">· expired and invoiced are automatic</span>
              </div>
            )}
          </Section>

          {/* 3. What - the quote itself */}
          <Section title="Line items" description="Pick a product to auto-fill HSN, rate and GST, or enter a custom item.">
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => set({ lines })}
              products={products}
              extraDiscountPercent={form.extraDiscountPercent}
              onExtraDiscountChange={(v) => set({ extraDiscountPercent: v })}
              interState={interState}
            />
          </Section>

          {/* 4. Terms - always present, rarely edited */}
          <Section title="Terms & conditions" description="Printed at the foot of the quotation">
            <ListTextarea
              ai={{
                purpose: "Terms and conditions printed at the foot of a sales quotation from Ortex Industries: validity, payment, artwork approval, production and delivery, one term per line",
                context: () => ({
                  validityDays: form.validityDays,
                  validUntil: form.validUntil,
                  paymentTerms: form.paymentTerms,
                  items: (form.lines || []).map((l) => l.description).filter(Boolean).slice(0, 10),
                }),
                format: "lines",
                maxChars: 900,
              }}
              value={form.terms}
              onChange={(e) => set({ terms: e.target.value })}
              placeholder="Enter terms and conditions"
              className="min-h-[110px]"
            />
          </Section>

          {/* 5. Optional extras, collapsed until needed */}
          <div className="rounded-card bg-card shadow-card">
            <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left" aria-expanded={moreOpen}>
              <div>
                <h3 className="text-[15px] font-semibold leading-5 text-foreground">Ship to & notes</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {form.shipTo ? `Ships to ${form.shipTo.company || form.shipTo.name || "a different address"}` : "Ships to the customer address"}
                  {form.notes ? " · note added" : ""}
                </p>
              </div>
              <span className="text-[13px] font-medium text-primary">{moreOpen ? "Hide" : "Edit"}</span>
            </button>
            {moreOpen && (
              <div className="space-y-5 border-t border-border px-5 py-5">
                <ShipToFields value={form.shipTo} onChange={(shipTo) => set({ shipTo })} customers={customers} />
                <Field label="Notes" hint="Printed under the totals">
                  <ListTextarea
                    ai={{
                      format: "paragraph",
                      purpose: "Short note printed under the totals of a sales quotation, for example what is included, a free mockup offer or a thank you",
                      context: () => ({
                        validUntil: form.validUntil,
                        paymentTerms: form.paymentTerms,
                        items: (form.lines || []).map((l) => l.description).filter(Boolean).slice(0, 10),
                      }),
                      maxChars: 300,
                    }}
                    value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    placeholder="Enter notes"
                    className="min-h-[80px]"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-[72px] xl:self-start">
          <LivePreview doc={liveDoc} settings={settings} type="quotation" onOpen={() => onPreview(liveDoc)} />
          {/* Only on a saved quotation: a draft has no row yet, so there is no
              authorship and nothing to show. */}
          {isEdit && <RecordActivity collection="quotations" record={draft} />}
        </div>
      </div>

      <EditorFooter
        left={
          isEdit && isAdmin && (
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )
        }
        right={
          <>
            {saveError ? (
              <span className="mr-2 text-[13px] font-medium text-destructive-text" role="alert">
                Not saved: {saveError}
              </span>
            ) : blocker ? (
              <span className="mr-2 flex items-center gap-1.5 text-[13px] font-medium text-warning-text">
                <AlertTriangle className="h-4 w-4" /> {blocker}
              </span>
            ) : (
              <span className="mr-2 hidden text-[13px] text-muted-foreground sm:inline">
                {summary}
                {dirty ? " · unsaved changes" : ""}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create quotation"}
            </Button>
          </>
        }
      />

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

      <Modal open={showLost} onClose={() => setShowLost(false)} title="Reason for losing this quote" width="max-w-sm">
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
