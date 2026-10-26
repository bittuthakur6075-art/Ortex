import { useEffect, useState, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Users, Plus, AlertTriangle } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSorting } from "../hooks/useCollection"
import { byNameAsc, dateValue, sortRows } from "../lib/listSort"
import { InlineSelect } from "../components/sales/ListParts"
import { sameCustomer, paymentsOrStored } from "../data/domain/domain"
import { isSettled } from "../lib/invoiceMoney"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { newCustomer } from "../data/domain/schema"
import { customerStats, CUSTOMER_STATUS } from "../lib/customerStats"
import { formatCurrency, formatDate } from "../lib/format"
import { stateName } from "../lib/gstStates"
import { exportCsv } from "../lib/csv"
import { findDuplicate, normaliseCustomer, validateCustomer, cleanPhoneInput } from "../lib/validateCustomer"
import { CompanyChip, CompanyField } from "../components/ui/CompanyChip"
import { useCompany } from "../hooks/useCompany"
import {
  Banner,
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
import { friendlyError } from "../lib/friendlyError"

// Match a stored document customer snapshot to a master customer (email → phone).
const matches = (customer, doc) => sameCustomer(customer, doc.customer)

// Columns that sort as numbers; everything else sorts as text (lib/listSort).
const NUMERIC_KEYS = new Set(["_orders", "_business", "_outstanding"])

const displayName = (row) => row.company || row.name || ""

function sortValue(row, key) {
  if (key === "name") return displayName(row)
  if (key === "createdAt" || key === "_lastOrderAt") return dateValue(row[key])
  if (NUMERIC_KEYS.has(key)) return Number(row[key]) || 0
  return row[key] ?? ""
}

// The Sort menu's presets; clicking a column header still sorts by that column.
const SORT_PRESETS = [
  { value: "name-asc", label: "Name A to Z", sort: { key: "name", desc: false } },
  { value: "name-desc", label: "Name Z to A", sort: { key: "name", desc: true } },
  { value: "recent", label: "Recently added", sort: { key: "createdAt", desc: true } },
  { value: "outstanding", label: "Most outstanding", sort: { key: "_outstanding", desc: true } },
  { value: "business", label: "Most business", sort: { key: "_business", desc: true } },
]
const presetOf = (sort) => SORT_PRESETS.find((p) => p.sort.key === sort.key && p.sort.desc === sort.desc)?.value || "column"

export default function Customers({ embedded = false }) {
  const { items, loading } = useCollection("customers")
  const { items: invoices } = useCollection("invoices")
  const { items: quotations } = useCollection("quotations")
  const { items: readPayments } = useCollection("payments")
  const profile = useProfile()
  const canPay = canAccess(profile, "payments")
  const payments = useMemo(() => paymentsOrStored(invoices, readPayments, canPay), [invoices, readPayments, canPay])
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const location = useLocation()
  const navTo = useNavigate()
  // The header's "+ New" menu: a new customer.
  useEffect(() => {
    if (!location.state?.create) return
    setCreating(true)
    navTo(location.pathname + location.search, { replace: true })
  }, [location.state, navTo, location.pathname, location.search])
  const [sort, onSort, setSort] = useSorting("name", false, "customers")
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
    return sortRows(rows, sort, sortValue, byNameAsc(displayName))
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
        <div className="flex items-center gap-2">
          <InlineSelect
            label="Sort"
            value={presetOf(sort)}
            onChange={(v) => {
              const preset = SORT_PRESETS.find((p) => p.value === v)
              if (preset) setSort(preset.sort)
            }}
            options={presetOf(sort) === "column" ? [...SORT_PRESETS, { value: "column", label: "By column" }] : SORT_PRESETS}
          />
          <ExportButton onClick={handleExport} disabled={!filtered.length} />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Customers are added automatically when you create a quotation or invoice. You can also add one by hand."
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
          <div className="relative overflow-x-auto">
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
                        <div className="min-w-0 max-w-[280px]">
                          <Link to={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-foreground hover:underline">
                            {c.company || c.name || "Unnamed"}
                          </Link>
                          <CompanyChip companyId={c.companyId} />
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
                      {!isSettled(c._outstanding) ? (
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

      <NewCustomerModal open={creating} onClose={() => setCreating(false)} customers={items} />
    </div>
  )
}

// Adding a customer by hand is a four-field job; everything else is edited on
// the customer's own page. The rules are lib/validateCustomer.js, the same ones
// the phone's contact editor enforces, so a duplicate is refused before the
// insert rather than discovered as two rows answering one quotation.
function NewCustomerModal({ open, onClose, customers: allCustomers }) {
  const [form, setForm] = useState(newCustomer())
  // The company (0075): the one in view; chosen here in All mode. A duplicate
  // is judged within it, since one person may be a customer of two companies.
  const { defaultCompany } = useCompany()
  const [companyId, setCompanyId] = useState(defaultCompany)
  const customers = useMemo(() => (companyId ? allCustomers.filter((c) => !c.companyId || c.companyId === companyId) : allCustomers), [allCustomers, companyId])
  useEffect(() => {
    if (open) setCompanyId((c) => c || defaultCompany)
  }, [open, defaultCompany])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    // A corrected field stops shouting; the form-wide line is re-judged on save.
    setErrors((e) => (e[k] || e.form ? { ...e, [k]: undefined, form: undefined } : e))
  }
  const duplicate = errors.form ? findDuplicate(form, customers) : null
  // Escape or the scrim asks before throwing typed details away.
  const dirty = ["company", "name", "email", "phone"].some((k) => String(form[k] || "").trim())

  const close = () => {
    setErrors({})
    onClose()
  }

  const save = async () => {
    const found = validateCustomer(form, customers)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const created = await repo.create("customers", { ...normaliseCustomer(form), ...(companyId ? { companyId } : {}) })
      toast.success("Customer added")
      setForm(newCustomer())
      close()
      if (created?.id) navigate(`/customers/${created.id}`)
    } catch (e) {
      toast.error(friendlyError(e, "Could not add the customer"))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={close}
      title="New customer"
      dirty={dirty}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            Add customer
          </Button>
        </>
      }
    >
      {errors.form && (
        <Banner tone="danger" className="mb-4">
          <AlertTriangle className="h-4 w-4 flex-none" />
          <span className="min-w-0">
            {errors.form}
            {duplicate && (
              <>
                {". "}
                <Link to={`/customers/${duplicate.id}`} onClick={close} className="font-semibold underline underline-offset-2">
                  Open {duplicate.company || duplicate.name || "that customer"}
                </Link>
              </>
            )}
          </span>
        </Banner>
      )}
      <CompanyField value={companyId} onChange={setCompanyId} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company">
          <Input value={form.company} maxLength={200} onChange={(e) => set("company", e.target.value)} placeholder="Enter company name" />
        </Field>
        <Field label="Contact Name" error={errors.name}>
          <Input value={form.name} maxLength={200} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} maxLength={254} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" error={errors.phone} hint="Stored without +91">
          <Input type="tel" inputMode="tel" value={form.phone} maxLength={40} onChange={(e) => set("phone", cleanPhoneInput(e.target.value))} />
        </Field>
      </div>
    </Modal>
  )
}
