import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Inbox, Plus, Search, Star, Mail, Phone, MessageCircle, Trash2, Target, Download, FileText, Printer } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { convertEnquiryToLead, createQuotation, markEnquiryQuoted } from "../data/domain"
import { useCollection, useSettings } from "../data/hooks"
import { ENQUIRY_STATUS, LEAD_SOURCES, PRODUCT_CATEGORIES, newEnquiry } from "../data/schema"
import { relativeTime, formatDateTime, formatCurrency } from "../lib/format"
import { isQuoteEnquiry, parseQuoteRfq, rfqToQuotationLines } from "../lib/quoteRfq"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import DocumentView from "../components/DocumentView"
import PageHeader from "../components/PageHeader"
import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Field,
  StatusBadge,
  EmptyState,
  Avatar,
  Chip,
  Drawer,
  PageLoader,
} from "../components/ui"

export default function Enquiries() {
  const { items, loading } = useCollection("enquiries")
  const { items: products } = useCollection("products")
  const settings = useSettings()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null) // generated quotation to print

  const quoteCount = useMemo(() => items.filter(isQuoteEnquiry).length, [items])

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter === "starred") rows = rows.filter((e) => e.starred)
    else if (statusFilter === "quotes") rows = rows.filter(isQuoteEnquiry)
    else if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((e) =>
        [e.customer?.name, e.customer?.company, e.customer?.email, e.productInterest, e.message, e.source]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [items, query, statusFilter])

  const active = selected === "new" ? "new" : selected ? items.find((e) => e.id === selected.id) || null : null

  const handleExport = () => {
    exportCsv(
      `ortex-enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Date", value: (e) => formatDateTime(e.createdAt) },
        { header: "Name", value: (e) => e.customer?.name },
        { header: "Company", value: (e) => e.customer?.company },
        { header: "Email", value: (e) => e.customer?.email },
        { header: "Phone", value: (e) => e.customer?.phone },
        { header: "Source", value: (e) => e.source },
        { header: "Interest", value: (e) => e.productInterest },
        { header: "Status", value: (e) => e.status },
        { header: "Message", value: (e) => e.message },
      ],
      filtered,
    )
  }

  return (
    <div>
      <PageHeader title="Enquiries" subtitle={`${items.length} leads across all sources`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setSelected("new")}>
          <Plus className="h-4 w-4" /> New enquiry
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, message…" className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </Chip>
          <Chip active={statusFilter === "starred"} onClick={() => setStatusFilter("starred")}>
            <Star className="h-3.5 w-3.5" /> Starred
          </Chip>
          <Chip active={statusFilter === "quotes"} onClick={() => setStatusFilter("quotes")}>
            <FileText className="h-3.5 w-3.5" /> Quote requests{quoteCount > 0 && ` (${quoteCount})`}
          </Chip>
          {ENQUIRY_STATUS.map((s) => (
            <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="No enquiries yet" description="Leads captured from the website or added manually appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => {
            const rfq = parseQuoteRfq(e)
            return (
              <Card
                key={e.id}
                onClick={() => setSelected(e)}
                className={cn(
                  "cursor-pointer p-4 transition-colors hover:border-primary/40",
                  rfq && "border-l-2 border-l-primary",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={e.customer?.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">{e.customer?.name || "Unknown"}</span>
                      {e.starred && <Star className="h-3.5 w-3.5 flex-none fill-amber-400 text-amber-400" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{e.customer?.company || e.customer?.email}</div>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    {isQuoteEnquiry(e) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <FileText className="h-3 w-3" /> Quote
                      </span>
                    )}
                    <StatusBadge list={ENQUIRY_STATUS} status={e.status} />
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{e.message}</p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {rfq
                      ? `${rfq.items.length} item${rfq.items.length > 1 ? "s" : ""} · est. ${formatCurrency(rfq.estimatePreTax)}`
                      : e.productInterest || "—"}
                  </span>
                  <span className="flex-none">{relativeTime(e.createdAt)}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <EnquiryDrawer
        enquiry={active}
        products={products}
        settings={settings}
        onPrint={(quote) => {
          setSelected(null)
          setPreview(quote)
        }}
        onClose={() => setSelected(null)}
      />

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
    </div>
  )
}

function EnquiryDrawer({ enquiry, products = [], settings, onPrint, onClose }) {
  const navigate = useNavigate()
  const isNew = enquiry === "new"
  const open = enquiry !== null
  const [form, setForm] = useState(newEnquiry())
  const [generating, setGenerating] = useState(false)

  const rfq = !isNew && enquiry ? parseQuoteRfq(enquiry) : null

  useEffect(() => {
    if (!open) return
    setForm(isNew ? newEnquiry() : { ...newEnquiry(), ...enquiry, customer: { ...newEnquiry().customer, ...enquiry.customer } })
  }, [open, isNew, enquiry])

  const setCustomer = (key, value) => setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }))
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const patch = async (changes) => {
    const next = { ...form, ...changes }
    setForm(next)
    if (!isNew) await repo.update("enquiries", enquiry.id, changes)
  }

  const saveNew = async () => {
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    await repo.create("enquiries", form)
    toast.success("Enquiry added")
    onClose()
  }

  const remove = async () => {
    if (window.confirm("Delete this enquiry?")) {
      await repo.remove("enquiries", enquiry.id)
      toast.success("Enquiry deleted")
      onClose()
    }
  }

  const convert = async () => {
    const lead = await convertEnquiryToLead(enquiry.id)
    toast.success("Converted to lead")
    onClose()
    navigate("/leads", { state: { openLeadId: lead.id } })
  }

  // Build a formal quotation from the customer's RFQ line items, link it back to
  // this enquiry, mark the enquiry "quoted", then open the printable document.
  const generateQuotation = async () => {
    if (!rfq || !settings) return
    setGenerating(true)
    try {
      const lines = rfqToQuotationLines(rfq.items, products)
      const quote = await createQuotation({
        customer: form.customer,
        lines,
        notes: `Generated from website quote request${form.customer.name ? ` — ${form.customer.name}` : ""}.`,
        enquiryId: enquiry.id,
      })
      await markEnquiryQuoted(enquiry.id)
      await repo.update("enquiries", enquiry.id, { quotationId: quote.id, quotationNumber: quote.number })
      toast.success(`Quotation ${quote.number} generated`)
      onPrint(quote)
    } catch {
      toast.error("Couldn't generate the quotation. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  const printExisting = async () => {
    const quote = await repo.get("quotations", enquiry.quotationId)
    if (quote) onPrint(quote)
    else toast.error("Linked quotation not found — generate a new one.")
  }

  const phoneDigits = (form.customer.phone || "").replace(/\D/g, "")
  const waNumber = phoneDigits.length === 10 ? "91" + phoneDigits : phoneDigits

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? "New enquiry" : form.customer.name || "Enquiry"}
      subtitle={isNew ? "Add a lead manually" : `${form.source} · ${formatDateTime(enquiry?.createdAt)}`}
      footer={
        isNew ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNew}>
              Add enquiry
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={convert}>
              <Target className="h-4 w-4" /> Convert to lead
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {!isNew && (
          <>
            <div className="flex flex-wrap gap-2">
              {form.customer.email && (
                <a href={`mailto:${form.customer.email}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
              {phoneDigits && (
                <>
                  <a href={`tel:${form.customer.phone}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                  <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </>
              )}
              <button
                onClick={() => patch({ starred: !form.starred })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted",
                  form.starred && "text-amber-500",
                )}
              >
                <Star className={cn("h-4 w-4", form.starred && "fill-amber-400 text-amber-400")} /> Star
              </button>
            </div>

            <Field label="Status">
              <div className="flex flex-wrap gap-1.5">
                {ENQUIRY_STATUS.map((s) => (
                  <Chip key={s.id} active={form.status === s.id} onClick={() => patch({ status: s.id })}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {rfq && (
          <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.03]">
            <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <FileText className="h-3.5 w-3.5" /> Quote request
              </span>
              <span className="text-xs text-muted-foreground">{rfq.items.length} item{rfq.items.length > 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th className="px-3 py-2 text-right font-medium">Disc</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rfq.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{it.category}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-foreground">{it.quantity} {it.unit || ""}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{formatCurrency(it.rate)}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{it.discountPercent ? `${it.discountPercent}%` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular font-medium text-foreground">{formatCurrency(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 border-t border-primary/20 px-3 py-2.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span className="tabular">{formatCurrency(rfq.subtotal)}</span>
              </div>
              {rfq.totalDiscount > 0 && (
                <div className="flex justify-between text-[hsl(var(--success))]">
                  <span>Volume discount</span><span className="tabular">−{formatCurrency(rfq.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                <span>Est. total (pre-tax)</span><span className="tabular text-primary">{formatCurrency(rfq.estimatePreTax)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Customer-facing estimate · GST added on the quotation.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-primary/20 bg-muted/30 px-3 py-2.5">
              {enquiry.quotationId ? (
                <>
                  <Button size="sm" onClick={printExisting}>
                    <Printer className="h-4 w-4" /> Print quotation {enquiry.quotationNumber || ""}
                  </Button>
                  <Button variant="outline" size="sm" onClick={generateQuotation} disabled={generating}>
                    {generating ? "Regenerating…" : "Regenerate"}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={generateQuotation} disabled={generating}>
                  <FileText className="h-4 w-4" /> {generating ? "Generating…" : "Generate quotation"}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input value={form.customer.name} onChange={(e) => setCustomer("name", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Company">
            <Input value={form.customer.company} onChange={(e) => setCustomer("company", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Email">
            <Input value={form.customer.email} onChange={(e) => setCustomer("email", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Phone">
            <Input value={form.customer.phone} onChange={(e) => setCustomer("phone", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="State code" hint="GST — e.g. 07 Delhi, 27 MH">
            <Input value={form.customer.stateCode} onChange={(e) => setCustomer("stateCode", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} placeholder="07" />
          </Field>
          <Field label="GSTIN">
            <Input value={form.customer.gstin} onChange={(e) => setCustomer("gstin", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Source">
            <Select value={form.source} onChange={(e) => patch({ source: e.target.value })}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Product interest">
            <Select value={form.productInterest} onChange={(e) => patch({ productInterest: e.target.value })}>
              <option value="">—</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Message">
          <Textarea value={form.message} onChange={(e) => set("message", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { message: form.message })} placeholder="Requirement details…" />
        </Field>

        {!isNew && !rfq && (
          <Field label="Internal notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} onBlur={() => repo.update("enquiries", enquiry.id, { notes: form.notes })} placeholder="Private notes (saved on blur)…" />
          </Field>
        )}
      </div>
    </Drawer>
  )
}
