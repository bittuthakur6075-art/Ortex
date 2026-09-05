import { useState, useMemo, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Users, Plus, Search, Mail, Phone, MessageCircle, Trash2, FileText, ReceiptIndianRupee } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSorting } from "../hooks/useCollection"
import { invoiceBalance, sameCustomer } from "../data/domain/domain"
import { newCustomer } from "../data/domain/schema"
import { formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import PageHeader from "../components/layout/PageHeader"
import { Button, Card, Input, Field, EmptyState, Avatar, Money, Drawer, PageLoader, SortTh } from "../components/ui/Ui"

// Match a stored document customer snapshot to a master customer (email → phone).
const matches = (customer, doc) => sameCustomer(customer, doc.customer)

export default function Customers() {
  const { items, loading } = useCollection("customers")
  const { items: invoices } = useCollection("invoices")
  const { items: quotations } = useCollection("quotations")
  const { items: payments } = useCollection("payments")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [sort, onSort] = useSorting("_business", true)

  const enriched = useMemo(() => {
    return items.map((c) => {
      const invs = invoices.filter((i) => i.status !== "cancelled" && matches(c, i))
      const quotes = quotations.filter((q) => matches(c, q))
      const business = round2(invs.reduce((s, i) => s + (i.totals?.taxable || 0), 0))
      const outstanding = round2(invs.reduce((s, i) => s + Math.max(0, invoiceBalance(i, payments)), 0))
      return { ...c, _invs: invs, _quotes: quotes, _business: business, _outstanding: outstanding, _orders: invs.length }
    })
  }, [items, invoices, quotations, payments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = enriched
    if (q) rows = rows.filter((c) => [c.name, c.company, c.email, c.phone, c.gstin].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
    
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      let valA = a[key]
      let valB = b[key]
      if (key === "name") {
        // Sort by company or name
        valA = a.company || a.name || ""
        valB = b.company || b.name || ""
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return valA.localeCompare(valB)
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [enriched, query, sort])

  const active = selected === "new" ? "new" : selected ? enriched.find((c) => c.id === selected.id) || null : null

  const handleExport = () => {
    exportCsv(
      `ortex-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Name", value: (c) => c.name },
        { header: "Company", value: (c) => c.company },
        { header: "Email", value: (c) => c.email },
        { header: "Phone", value: (c) => c.phone },
        { header: "GSTIN", value: (c) => c.gstin },
        { header: "State", value: (c) => c.stateCode },
        { header: "Orders", value: (c) => c._orders },
        { header: "Business", value: (c) => c._business },
        { header: "Outstanding", value: (c) => c._outstanding },
      ],
      filtered,
    )
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${items.length} customers · auto-built from quotes & invoices`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          Export
        </Button>
        <Button size="sm" onClick={() => setSelected("new")}>
          <Plus className="h-4 w-4" /> New customer
        </Button>
      </PageHeader>

      <div className="relative mb-4 md:w-[360px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, GSTIN…" className="pl-10" />
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Customers are added automatically when you create a quotation or invoice — or add one manually."
          action={
            <Button onClick={() => setSelected("new")}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head">
                <tr>
                  <SortTh sortKey="name" sort={sort} onSort={onSort}>Customer</SortTh>
                  <SortTh sortKey="gstin" sort={sort} onSort={onSort}>GSTIN</SortTh>
                  <SortTh sortKey="_orders" sort={sort} onSort={onSort} align="right">Orders</SortTh>
                  <SortTh sortKey="_business" sort={sort} onSort={onSort} align="right">Business</SortTh>
                  <SortTh sortKey="_outstanding" sort={sort} onSort={onSort} align="right">Outstanding</SortTh>
                </tr>
              </thead>
              <tbody className="mt-body">
                {filtered.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.company || c.name} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{c.company || c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{c.company ? c.name : c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{c.gstin || "—"}</td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">{c._orders}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      <Money value={c._business} />
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {c._outstanding > 0.5 ? <span className="font-medium text-warning-text">{formatCurrency(c._outstanding)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CustomerDrawer customer={active} onClose={() => setSelected(null)} />
    </div>
  )
}

function CustomerDrawer({ customer, onClose }) {
  const isNew = customer === "new"
  const open = customer !== null
  const navigate = useNavigate()
  const [form, setForm] = useState(newCustomer())

  useEffect(() => {
    if (!open) return
    setForm(isNew ? newCustomer() : { ...newCustomer(), ...customer })
  }, [open, isNew, customer])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const saveField = () => !isNew && repo.update("customers", customer.id, form)

  const saveNew = async () => {
    if (!form.name.trim() && !form.company.trim()) return toast.error("Enter a name or company")
    await repo.create("customers", form)
    toast.success("Customer added")
    onClose()
  }
  const remove = async () => {
    if (window.confirm("Delete this customer? Their quotes/invoices are kept.")) {
      await repo.remove("customers", customer.id)
      toast.success("Customer deleted")
      onClose()
    }
  }

  const phoneDigits = (form.phone || "").replace(/\D/g, "")
  const wa = phoneDigits.length === 10 ? "91" + phoneDigits : phoneDigits

  // Start a quotation for this customer: hand Quotations a clean snapshot
  // (master fields only, none of the derived `_` stats).
  const startQuotation = () => {
    const snapshot = { ...newCustomer() }
    for (const k of Object.keys(snapshot)) if (form[k] !== undefined) snapshot[k] = form[k]
    navigate("/quotations", { state: { fromCustomer: snapshot } })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? "New customer" : form.company || form.name || "Customer"}
      subtitle={isNew ? "Add to the customer master" : form.company ? form.name : ""}
      footer={
        isNew ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNew}>
              Add customer
            </Button>
          </div>
        ) : (
          <div className="flex justify-between">
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {!isNew && customer && (
          <>
            <div className="flex flex-wrap gap-2">
              {form.email && (
                <a href={`mailto:${form.email}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
              {phoneDigits && (
                <>
                  <a href={`tel:${form.phone}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10")}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={startQuotation}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted"
              >
                <FileText className="h-4 w-4" /> New quotation
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Orders" value={customer._orders} />
              <Stat label="Business" value={formatCurrency(customer._business)} />
              <Stat label="Outstanding" value={formatCurrency(customer._outstanding)} tone={customer._outstanding > 0.5 ? "amber" : ""} />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={saveField} />
          </Field>
          <Field label="Company">
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} onBlur={saveField} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={saveField} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={saveField} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} onBlur={saveField} />
          </Field>
          <Field label="State code">
            <Input value={form.stateCode} onChange={(e) => set("stateCode", e.target.value)} onBlur={saveField} placeholder="07" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} onBlur={saveField} />
          </Field>
        </div>

        {!isNew && customer && (customer._invs.length > 0 || customer._quotes.length > 0) && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">History</h3>
            <div className="divide-y divide-border rounded-xl border border-border">
              {customer._invs.map((i) => (
                <Link
                  key={i.id}
                  to="/billing?tab=invoices"
                  state={{ openId: i.id }}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-subtle"
                  title={`Open invoice ${i.number}`}
                >
                  <ReceiptIndianRupee className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="font-medium text-foreground">{i.number}</span>
                  <span className="ml-auto text-muted-foreground">{formatCurrency(i.totals?.grandTotal)}</span>
                </Link>
              ))}
              {customer._quotes.map((q) => (
                <Link
                  key={q.id}
                  to="/quotations"
                  state={{ openId: q.id }}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-subtle"
                  title={`Open quotation ${q.number}`}
                >
                  <FileText className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="font-medium text-foreground">{q.number}</span>
                  <span className="ml-auto text-muted-foreground">{formatCurrency(q.totals?.grandTotal)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-base font-bold text-foreground", tone === "amber" && "text-warning-text")}>{value}</div>
    </div>
  )
}
