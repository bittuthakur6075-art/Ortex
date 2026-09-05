import { useState, useMemo } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Users,
  Mail,
  Phone,
  MessageCircle,
  FileText,
  ReceiptIndianRupee,
  ReceiptText,
  Wallet,
  TrendingUp,
  CalendarClock,
  IndianRupee,
  Package,
  Inbox,
  Trash2,
} from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection } from "../hooks/useCollection"
import { sameCustomer, resolveInvoiceStatus } from "../data/domain/domain"
import { newCustomer, INVOICE_STATUS, QUOTATION_STATUS, ENQUIRY_STATUS } from "../data/domain/schema"
import { customerStats, purchasedItems, receivedAgainst, whatsappNumber, CUSTOMER_STATUS, DORMANT_AFTER_DAYS } from "../lib/customerStats"
import { formatCurrency, formatDate, formatNumber, relativeTime } from "../lib/format"
import { stateLabel } from "../lib/gstStates"
import { EditorHeader, Tiles, Tile, Section, EditorFooter } from "../components/editors/DocumentEditorShell"
import { Button, Input, Field, StatusBadge, EmptyState, Money, PageLoader } from "../components/ui/Ui"

const byNewest = (a, b) => new Date(b.issueDate || b.createdAt || 0) - new Date(a.issueDate || a.createdAt || 0)

// One customer, end to end: who they are, what they owe, what they buy and
// every document that ties back to them.
export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items: customers, loading } = useCollection("customers")
  const { items: invoices } = useCollection("invoices")
  const { items: quotations } = useCollection("quotations")
  const { items: payments } = useCollection("payments")
  const { items: enquiries } = useCollection("enquiries")

  const record = customers.find((c) => c.id === id) || null
  // The edit buffer only wins once it belongs to the customer on screen, so a
  // background store refresh never clobbers what is being typed and switching
  // customers never shows the previous one's values.
  const [draft, setDraft] = useState(null)

  const linked = useMemo(() => {
    if (!record) return { invoices: [], quotations: [], payments: [], enquiries: [] }
    const invs = invoices.filter((i) => sameCustomer(record, i.customer)).sort(byNewest)
    const invoiceIds = new Set(invs.map((i) => i.id))
    return {
      invoices: invs,
      quotations: quotations.filter((q) => sameCustomer(record, q.customer)).sort(byNewest),
      payments: payments
        .filter((p) => p.type === "inflow" && (invoiceIds.has(p.invoiceId) || sameCustomer(record, p.customer)))
        .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)),
      enquiries: enquiries
        .filter((e) => sameCustomer(record, e.customer))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    }
  }, [record, invoices, quotations, payments, enquiries])

  const stats = useMemo(() => customerStats(linked.invoices, payments), [linked.invoices, payments])
  const buys = useMemo(() => purchasedItems([...linked.invoices, ...linked.quotations]), [linked.invoices, linked.quotations])

  if (loading) return <PageLoader />

  if (!record) {
    return (
      <EmptyState
        icon={Users}
        title="Customer not found"
        description="This customer may have been deleted, or the link is out of date."
        action={<Button onClick={() => navigate("/customers")}>Back to customers</Button>}
      />
    )
  }

  const form = draft && draft.id === record.id ? draft : { ...newCustomer(), ...record }
  const title = form.company || form.name || "Customer"
  const wa = whatsappNumber(form.phone)
  const saveField = () => repo.update("customers", record.id, form)
  const set = (k, v) => setDraft({ ...form, [k]: v })

  // Hand Quotations a clean master snapshot, none of the derived figures.
  const startQuotation = () => {
    const snapshot = { ...newCustomer() }
    for (const k of Object.keys(snapshot)) if (form[k] !== undefined) snapshot[k] = form[k]
    navigate("/quotations", { state: { fromCustomer: snapshot } })
  }

  const remove = async () => {
    if (!window.confirm("Delete this customer? Their quotations, invoices and payments are kept.")) return
    await repo.remove("customers", record.id)
    toast.success("Customer deleted")
    navigate("/customers")
  }

  const metaBits = [
    form.company ? form.name : "",
    form.email,
    form.phone,
    stateLabel(form.stateCode),
  ].filter(Boolean)

  return (
    <div>
      <EditorHeader
        onBack={() => navigate("/customers")}
        backLabel="Back to customers"
        title={title}
        trail={["CRM", "Customers", "Details"]}
        badge={<StatusBadge list={CUSTOMER_STATUS} status={stats.status} />}
        meta={metaBits.join(" · ") || "No contact details yet"}
        actions={
          <>
            {form.email && <QuickLink href={`mailto:${form.email}`} icon={Mail} label="Email" />}
            {wa && (
              <>
                <QuickLink href={`tel:${form.phone}`} icon={Phone} label="Call" />
                <QuickLink href={`https://wa.me/${wa}`} icon={MessageCircle} label="WhatsApp" external className="text-success-text" />
              </>
            )}
            <Button size="md" onClick={startQuotation}>
              <FileText className="h-4 w-4" /> New quotation
            </Button>
          </>
        }
      />

      <Tiles className="xl:grid-cols-5">
        <Tile icon={TrendingUp} label="Lifetime business" value={formatCurrency(stats.business)} sub={`${linked.quotations.length} quotation${linked.quotations.length === 1 ? "" : "s"} raised`} />
        <Tile
          icon={Wallet}
          tone={stats.overdue > 0.5 ? "danger" : stats.outstanding > 0.5 ? "warning" : "success"}
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          sub={stats.overdue > 0.5 ? `${formatCurrency(stats.overdue)} past due` : "Nothing past due"}
        />
        <Tile icon={ReceiptText} tone="info" label="Orders" value={formatNumber(stats.orders)} sub="Invoices raised" />
        <Tile icon={IndianRupee} tone="slate" label="Average order" value={formatCurrency(stats.avgOrder)} />
        <Tile
          icon={CalendarClock}
          tone={stats.daysSinceOrder != null && stats.daysSinceOrder >= DORMANT_AFTER_DAYS ? "warning" : "slate"}
          label="Last order"
          value={stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "Never"}
          sub={stats.daysSinceOrder != null ? `${stats.daysSinceOrder} days ago` : "No invoice yet"}
        />
      </Tiles>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <Section title="Contact & GST" description="Saved as you leave each field. These details fill new quotations and invoices.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company">
                <Input value={form.company} onChange={(e) => set("company", e.target.value)} onBlur={saveField} />
              </Field>
              <Field label="Contact name">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={saveField} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={saveField} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={saveField} />
              </Field>
              <Field label="GSTIN">
                <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} onBlur={saveField} placeholder="07AAACO1234A1Z5" />
              </Field>
              <Field label="State code" hint={stateLabel(form.stateCode) || "Sets IGST vs CGST + SGST"}>
                <Input value={form.stateCode} onChange={(e) => set("stateCode", e.target.value)} onBlur={saveField} placeholder="07" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} onBlur={saveField} />
              </Field>
            </div>
          </Section>

          <Section
            title="What they buy"
            description="Line items rolled up across every quotation and invoice, biggest spend first."
            bodyClassName={buys.length ? "p-0" : "p-5"}
          >
            {buys.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No line items yet. Raise a quotation to start the history.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="mt-head">
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Documents</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="mt-body">
                    {buys.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 flex-none text-muted-foreground" />
                            <span className="truncate font-medium text-foreground">{row.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                          {formatNumber(row.quantity)} {row.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{row.times}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">
                          <Money value={row.value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Invoices" description="Every invoice raised for this customer" bodyClassName="p-0">
            <DocList
              rows={linked.invoices}
              empty="No invoices yet."
              render={(inv) => ({
                to: "/billing?tab=invoices",
                state: { openId: inv.id },
                icon: ReceiptIndianRupee,
                title: inv.number || "Invoice",
                sub: `${formatDate(inv.issueDate)}${inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ""}`,
                badge: <StatusBadge list={INVOICE_STATUS} status={resolveInvoiceStatus(inv, payments)} />,
                amount: inv.totals?.grandTotal,
                note: (() => {
                  const balance = (Number(inv.totals?.grandTotal) || 0) - receivedAgainst(inv.id, payments)
                  return balance > 0.5 && inv.status !== "cancelled" ? `${formatCurrency(balance)} due` : "Settled"
                })(),
              })}
            />
          </Section>

          <Section title="Quotations" description="Quotes sent, won and lost" bodyClassName="p-0">
            <DocList
              rows={linked.quotations}
              empty="No quotations yet."
              render={(q) => ({
                to: "/quotations",
                state: { openId: q.id },
                icon: FileText,
                title: q.number || "Quotation",
                sub: formatDate(q.issueDate || q.createdAt),
                badge: <StatusBadge list={QUOTATION_STATUS} status={q.status} />,
                amount: q.totals?.grandTotal,
              })}
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Payments received" description="Money in against this customer's invoices" bodyClassName="p-0">
            {linked.payments.length === 0 ? (
              <p className="p-5 text-[13px] text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {linked.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-success/12 text-success-text">
                      <IndianRupee className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {p.number || "Payment"}
                        {p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(p.date || p.createdAt)} · {p.method || "Payment"}
                      </div>
                    </div>
                    <span className="flex-none text-[13px] font-medium text-foreground">
                      <Money value={p.amount} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Enquiries" description="Requests received from this customer" bodyClassName="p-0">
            {linked.enquiries.length === 0 ? (
              <p className="p-5 text-[13px] text-muted-foreground">No enquiries from this customer.</p>
            ) : (
              <ul className="divide-y divide-border">
                {linked.enquiries.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary/10 text-primary">
                      <Inbox className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">{e.productInterest || e.reference || "Enquiry"}</span>
                        <StatusBadge list={ENQUIRY_STATUS} status={e.status} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.source || "Website"} · {relativeTime(e.createdAt)}
                      </div>
                      {e.message && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.message}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <EditorFooter
        left={
          <Button variant="dangerGhost" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete customer
          </Button>
        }
        right={
          <>
            <span className="mr-2 hidden text-[13px] text-muted-foreground sm:inline">Changes save as you type</span>
            <Button variant="outline" size="sm" onClick={() => navigate("/customers")}>
              Back to customers
            </Button>
          </>
        }
      />
    </div>
  )
}

// Header quick action styled to match a 40px outline button.
function QuickLink({ href, icon: Icon, label, external, className }) {
  return (
    <a
      href={href}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`squircle inline-flex h-10 items-center gap-2 rounded-btn-md border border-border bg-card px-[20px] text-sm font-semibold text-foreground transition-colors hover:bg-subtle ${className || ""}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </a>
  )
}

// Shared row list for the quotation and invoice histories.
function DocList({ rows, empty, render }) {
  if (!rows.length) return <p className="p-5 text-[13px] text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const r = render(row)
        const Icon = r.icon
        return (
          <li key={row.id}>
            <Link to={r.to} state={r.state} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle" title={`Open ${r.title}`}>
              <Icon className="h-4 w-4 flex-none text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-foreground">{r.title}</span>
                  {r.badge}
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
              </div>
              <div className="flex-none text-right">
                <div className="text-[13px] font-medium text-foreground">
                  <Money value={r.amount} />
                </div>
                {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
