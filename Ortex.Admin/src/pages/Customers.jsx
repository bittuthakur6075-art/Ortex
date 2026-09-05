import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, Plus } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSorting } from "../hooks/useCollection"
import { sameCustomer } from "../data/domain/domain"
import { newCustomer } from "../data/domain/schema"
import { customerStats, CUSTOMER_STATUS } from "../lib/customerStats"
import { formatCurrency, formatDate } from "../lib/format"
import { stateName } from "../lib/gstStates"
import { exportCsv } from "../lib/csv"
import {
  Button,
  Card,
  CardHeader,
  Input,
  SearchInput,
  ExportButton,
  Field,
  EmptyState,
  Avatar,
  Money,
  Modal,
  PageLoader,
  SortTh,
  StatusBadge,
} from "../components/ui/Ui"

// Match a stored document customer snapshot to a master customer (email → phone).
const matches = (customer, doc) => sameCustomer(customer, doc.customer)

// Columns that sort as numbers; everything else sorts as lowercased text.
const NUMERIC_KEYS = new Set(["_orders", "_business", "_outstanding", "_lastOrderAt"])

function sortValue(row, key) {
  if (key === "name") return (row.company || row.name || "").toLowerCase()
  if (NUMERIC_KEYS.has(key)) return Number(row[key]) || 0
  return String(row[key] ?? "").toLowerCase()
}

export default function Customers({ embedded = false }) {
  const { items, loading } = useCollection("customers")
  const { items: invoices } = useCollection("invoices")
  const { items: quotations } = useCollection("quotations")
  const { items: payments } = useCollection("payments")
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [sort, onSort] = useSorting("_business", true)
  const navigate = useNavigate()

  const enriched = useMemo(() => {
    return items.map((c) => {
      const invs = invoices.filter((i) => matches(c, i))
      const quotes = quotations.filter((q) => matches(c, q))
      const stats = customerStats(invs, payments)
      return {
        ...c,
        _quotes: quotes.length,
        _orders: stats.orders,
        _business: stats.business,
        _outstanding: stats.outstanding,
        _lastOrderAt: stats.lastOrderAt,
        _daysSinceOrder: stats.daysSinceOrder,
        _status: stats.status,
      }
    })
  }, [items, invoices, quotations, payments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = enriched
    if (q) {
      rows = rows.filter((c) =>
        [c.name, c.company, c.email, c.phone, c.gstin, stateName(c.stateCode)]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q)),
      )
    }
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      const valA = sortValue(a, key)
      const valB = sortValue(b, key)
      if (typeof valA === "string" || typeof valB === "string") return String(valA).localeCompare(String(valB))
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [enriched, query, sort])

  const handleExport = () => {
    exportCsv(
      `ortex-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Name", value: (c) => c.name },
        { header: "Company", value: (c) => c.company },
        { header: "Email", value: (c) => c.email },
        { header: "Phone", value: (c) => c.phone },
        { header: "GSTIN", value: (c) => c.gstin },
        { header: "State", value: (c) => stateName(c.stateCode) || c.stateCode },
        { header: "Orders", value: (c) => c._orders },
        { header: "Quotations", value: (c) => c._quotes },
        { header: "Last order", value: (c) => (c._lastOrderAt ? formatDate(c._lastOrderAt) : "") },
        { header: "Lifetime business", value: (c) => c._business },
        { header: "Outstanding", value: (c) => c._outstanding },
        { header: "Status", value: (c) => c._status },
      ],
      filtered,
    )
  }

  return (
    <div>
      {/* Toolbar above the table: search on the left, Export on the right.
          The title and the create action sit in the table's own card header. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          className="w-full md:w-[360px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, GSTIN or state"
        />
        <ExportButton onClick={handleExport} disabled={!filtered.length} />
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Customers are added automatically when you create a quotation or invoice - or add one manually."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title={embedded ? "" : "Customers"}
            description={embedded ? "" : `${filtered.length} of ${items.length}`}
            action={<Button onClick={() => setCreating(true)}>New customer</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head">
                <tr>
                  <SortTh sortKey="name" sort={sort} onSort={onSort}>Customer</SortTh>
                  <SortTh sortKey="phone" sort={sort} onSort={onSort}>Phone</SortTh>
                  <SortTh sortKey="gstin" sort={sort} onSort={onSort}>GSTIN</SortTh>
                  <SortTh sortKey="stateCode" sort={sort} onSort={onSort}>State</SortTh>
                  <SortTh sortKey="_orders" sort={sort} onSort={onSort} align="right">Orders</SortTh>
                  <SortTh sortKey="_lastOrderAt" sort={sort} onSort={onSort}>Last order</SortTh>
                  <SortTh sortKey="_business" sort={sort} onSort={onSort} align="right">Lifetime business</SortTh>
                  <SortTh sortKey="_outstanding" sort={sort} onSort={onSort} align="right">Outstanding</SortTh>
                  <SortTh sortKey="_status" sort={sort} onSort={onSort}>Status</SortTh>
                </tr>
              </thead>
              <tbody className="mt-body">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/customers/${c.id}`)}
                    title={`Open ${c.company || c.name || "customer"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.company || c.name} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{c.company || c.name || "Unnamed"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[c.company ? c.name : "", c.email].filter(Boolean).join(" · ") || "No contact details"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{c.phone || "-"}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{c.gstin || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{stateName(c.stateCode) || "-"}</td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">
                      {c._orders}
                      {c._quotes > 0 && <span className="ml-1 text-xs text-subtle-foreground">/ {c._quotes}q</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c._lastOrderAt ? (
                        <>
                          <span className="tabular">{formatDate(c._lastOrderAt)}</span>
                          {c._daysSinceOrder != null && (
                            <span className="ml-1 text-xs text-subtle-foreground">{c._daysSinceOrder}d ago</span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      <Money value={c._business} />
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {c._outstanding > 0.5 ? (
                        <span className="font-medium text-warning-text">{formatCurrency(c._outstanding)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge list={CUSTOMER_STATUS} status={c._status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NewCustomerModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

// Adding a customer by hand is a four-field job; everything else is edited on
// the customer's own page.
function NewCustomerModal({ open, onClose }) {
  const [form, setForm] = useState(newCustomer())
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim() && !form.company.trim()) return toast.error("Enter a name or company")
    setSaving(true)
    try {
      const created = await repo.create("customers", form)
      toast.success("Customer added")
      setForm(newCustomer())
      onClose()
      if (created?.id) navigate(`/customers/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New customer"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            Add customer
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company">
          <Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Bright Future School" />
        </Field>
        <Field label="Contact name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
