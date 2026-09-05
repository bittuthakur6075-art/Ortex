import { useState, useEffect, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Inbox, Star, Mail, Phone, MessageCircle, Trash2, FileText, Printer, Package, Clock, ImageIcon, Hash } from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection, useSettings } from "../hooks/useCollection"
import { ENQUIRY_STATUS, LEAD_SOURCES, PRODUCT_CATEGORIES, newEnquiry } from "../data/domain/schema"
import { formatDateTime, formatNumber, relativeTime } from "../lib/format"
import { parseQuoteRfq, rfqToQuotationLines, rfqArtwork, rfqUnits, enquiryAge } from "../lib/quoteRfq"
import { cn } from "../lib/cn"
import DocumentView from "../components/documents/DocumentView"
import { EditorHeader, Tiles, Tile, Section, EditorFooter } from "../components/editors/DocumentEditorShell"
import { Button, Input, Select, Textarea, Field, StatusBadge, EmptyState, PageLoader, Banner } from "../components/ui/Ui"
import EnquiryStatusStepper from "./enquiries/EnquiryStatusStepper"
import EnquiryRequest from "./enquiries/EnquiryRequest"

// Full-page view of a single enquiry, matching the quotation and invoice
// editors. Everything here writes straight back on change or on blur: an
// enquiry is a live record the sales desk works through, not a form to submit.
export default function EnquiryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, loading } = useCollection("enquiries")
  const { items: products } = useCollection("products")
  const { items: quotations } = useCollection("quotations")
  const settings = useSettings()

  const enquiry = useMemo(() => items.find((e) => e.id === id) || null, [items, id])
  const [form, setForm] = useState(newEnquiry())
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (enquiry) setForm({ ...newEnquiry(), ...enquiry, customer: { ...newEnquiry().customer, ...enquiry.customer } })
  }, [enquiry])

  const rfq = useMemo(() => parseQuoteRfq(enquiry), [enquiry])
  const artwork = useMemo(() => (enquiry ? rfqArtwork(enquiry) : null), [enquiry])
  const linkedQuote = useMemo(
    () => (enquiry?.quotationId ? quotations.find((q) => q.id === enquiry.quotationId) || null : null),
    [quotations, enquiry],
  )

  const back = () => navigate("/enquiries")

  if (loading) return <PageLoader />

  if (!enquiry) {
    return (
      <EmptyState
        icon={Inbox}
        title="Enquiry not found"
        description="This enquiry may have been deleted, or the link is out of date."
        action={
          <Button size="sm" onClick={back}>
            Back to enquiries
          </Button>
        }
      />
    )
  }

  const rfqItems = rfq?.items || []
  const units = rfqUnits(rfqItems)
  const age = enquiryAge(enquiry)
  const submitted = enquiry.createdAt || enquiry.submittedAt
  const phoneDigits = (form.customer.phone || "").replace(/\D/g, "")
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits
  const tracking = enquiry.tracking || null

  const patch = async (changes) => {
    setForm((f) => ({ ...f, ...changes }))
    await repo.update("enquiries", enquiry.id, changes)
  }

  const setCustomer = (key, value) => setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }))
  const saveCustomer = () => repo.update("enquiries", enquiry.id, { customer: form.customer })

  const startQuotation = () => {
    navigate("/quotations", {
      state: {
        fromEnquiry: {
          id: enquiry.id,
          customer: enquiry.customer,
          message: enquiry.reference || "",
          lines: rfqToQuotationLines(rfqItems, products),
        },
      },
    })
  }

  const viewQuotation = async () => {
    const quote = linkedQuote || (await repo.get("quotations", enquiry.quotationId))
    if (quote) setPreview(quote)
    else toast.error("Linked quotation not found - generate a new one.")
  }

  const remove = async () => {
    if (!window.confirm("Delete this enquiry? This cannot be undone.")) return
    await repo.remove("enquiries", enquiry.id)
    toast.success("Enquiry deleted")
    back()
  }

  const quoteLabel = linkedQuote?.number || enquiry.quotationNumber || "quotation"
  const statusLabel = ENQUIRY_STATUS.find((s) => s.id === form.status)?.label || form.status

  return (
    <div>
      <EditorHeader
        onBack={back}
        backLabel="Back to enquiries"
        title={form.customer.name || "Enquiry"}
        trail={[form.source || "Direct", enquiry.reference].filter(Boolean)}
        badge={<StatusBadge list={ENQUIRY_STATUS} status={form.status} />}
        meta={`Submitted ${formatDateTime(submitted)} · ${relativeTime(submitted)}`}
        actions={
          <>
            <QuickLink href={form.customer.email ? `mailto:${form.customer.email}` : null} label="Email" icon={Mail} />
            <QuickLink href={phoneDigits ? `tel:${form.customer.phone}` : null} label="Call" icon={Phone} />
            <QuickLink
              href={phoneDigits.length >= 10 ? `https://wa.me/${waNumber}` : null}
              label="WhatsApp"
              icon={MessageCircle}
              external
            />
            <Button
              variant="outline"
              size="md"
              title={form.starred ? "Remove star" : "Star this enquiry"}
              onClick={() => patch({ starred: !form.starred })}
              className={cn(form.starred && "text-warning-text")}
            >
              <Star className={cn("h-4 w-4", form.starred && "fill-current")} /> Star
            </Button>
            {enquiry.quotationId ? (
              <Button size="md" onClick={viewQuotation}>
                <Printer className="h-4 w-4" /> View {quoteLabel}
              </Button>
            ) : (
              <Button size="md" onClick={startQuotation}>
                <FileText className="h-4 w-4" /> Create quotation
              </Button>
            )}
          </>
        }
      />

      <Tiles className="xl:grid-cols-4">
        <Tile
          icon={Package}
          label={rfqItems.length ? "Requested" : "Interest"}
          value={rfqItems.length ? formatNumber(units) : form.productInterest || "Not set"}
          sub={rfqItems.length ? `${rfqItems.length} line${rfqItems.length === 1 ? "" : "s"}` : "No itemised request"}
        />
        <Tile icon={Hash} tone="info" label="Source" value={form.source || "Direct"} sub={enquiry.reference || "No reference"} />
        <Tile
          icon={Clock}
          tone={age.overdue ? "danger" : "slate"}
          label="Age"
          value={age.label}
          sub={age.overdue ? "Still unworked - chase it today" : `Status: ${statusLabel}`}
        />
        <Tile
          icon={ImageIcon}
          tone={artwork ? (artwork.failed ? "danger" : "success") : "slate"}
          label="Artwork"
          value={artwork ? (artwork.failed ? "Failed" : "Attached") : "None"}
          sub={artwork?.fileName || "Nothing was uploaded"}
        />
      </Tiles>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Section title="Pipeline" description="Move this enquiry along as you work it.">
            <EnquiryStatusStepper status={form.status} onChange={(status) => patch({ status })} />
          </Section>

          <Section
            title="What they asked for"
            description={
              rfqItems.length
                ? "Sent by the website quote builder - quantities only, no prices."
                : "The message this enquiry arrived with."
            }
            action={
              rfqItems.length ? (
                <span className="text-xs text-muted-foreground tabular">
                  {formatNumber(units)} units · {rfqItems.length} line{rfqItems.length === 1 ? "" : "s"}
                </span>
              ) : null
            }
          >
            <EnquiryRequest items={rfqItems} artwork={artwork} message={form.message} />
          </Section>

          <Section
            title="Contact and GST details"
            description="GSTIN and state code decide whether the quotation charges IGST or CGST plus SGST."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={form.customer.name} onChange={(e) => setCustomer("name", e.target.value)} onBlur={saveCustomer} />
              </Field>
              <Field label="Company">
                <Input value={form.customer.company} onChange={(e) => setCustomer("company", e.target.value)} onBlur={saveCustomer} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.customer.email} onChange={(e) => setCustomer("email", e.target.value)} onBlur={saveCustomer} />
              </Field>
              <Field label="Phone">
                <Input value={form.customer.phone} onChange={(e) => setCustomer("phone", e.target.value)} onBlur={saveCustomer} />
              </Field>
              <Field label="GSTIN">
                <Input
                  value={form.customer.gstin}
                  onChange={(e) => setCustomer("gstin", e.target.value)}
                  onBlur={saveCustomer}
                  placeholder="07AAACO1234A1Z5"
                />
              </Field>
              <Field label="State code" hint="GST - e.g. 07 Delhi, 27 Maharashtra">
                <Input
                  value={form.customer.stateCode}
                  onChange={(e) => setCustomer("stateCode", e.target.value)}
                  onBlur={saveCustomer}
                  placeholder="07"
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Changes save as you leave each field.</p>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Classification">
            <div className="space-y-4">
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
                  <option value="">Not set</option>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Message">
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              onBlur={() => repo.update("enquiries", enquiry.id, { message: form.message })}
              placeholder="Requirement details"
              rows={5}
            />
          </Section>

          <Section title="Internal notes" description={rfq ? "Held by the quote request payload." : "Private to your team."}>
            {rfq ? (
              <Banner tone="info">This enquiry stores its quote request in the notes field, so it is kept read-only here.</Banner>
            ) : (
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                onBlur={() => repo.update("enquiries", enquiry.id, { notes: form.notes })}
                placeholder="Private notes, saved when you leave the box"
                rows={5}
              />
            )}
          </Section>

          {tracking && (tracking.userId || tracking.sessionId) && (
            <Section title="Attribution" description="Links this enquiry back to the website session it came from.">
              <dl className="space-y-1.5 text-xs text-muted-foreground">
                {tracking.userId && (
                  <div className="flex items-start gap-2">
                    <dt className="w-20 flex-none">User</dt>
                    <dd className="min-w-0 break-all font-medium text-foreground">{tracking.userId}</dd>
                  </div>
                )}
                {tracking.sessionId && (
                  <div className="flex items-start gap-2">
                    <dt className="w-20 flex-none">Session</dt>
                    <dd className="min-w-0 break-all font-medium text-foreground">{tracking.sessionId}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}
        </div>
      </div>

      <EditorFooter
        left={
          <Button variant="dangerGhost" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        }
        right={
          <>
            <span className="mr-2 hidden text-[13px] text-muted-foreground sm:inline">All changes save automatically</span>
            <Button variant="outline" size="sm" onClick={back}>
              Back to enquiries
            </Button>
          </>
        }
      />

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
    </div>
  )
}

// A contact shortcut that stays visible but inert when we have no address for
// it, so the action row does not reshuffle between enquiries.
function QuickLink({ href, label, icon: Icon, external }) {
  const base = "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium transition-colors"
  if (!href) {
    return (
      <span className={cn(base, "cursor-not-allowed text-subtle-foreground")} title={`No ${label.toLowerCase()} on file`}>
        <Icon className="h-4 w-4" /> {label}
      </span>
    )
  }
  return (
    <a
      href={href}
      title={label}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(base, "text-foreground hover:bg-muted")}
    >
      <Icon className="h-4 w-4" /> {label}
    </a>
  )
}
